/**
 * Matching engine. Decoupled from rendering: it walks a root subtree, builds a
 * flat concatenated string with an offset map back to `(text node, offset)`,
 * runs one combined regex per group, resolves overlaps deterministically, and
 * produces DOM `Range`s (which may span multiple text nodes/elements).
 */

import type { HighlightGroup, MatchInfo, OverlapStrategy } from './types.js';

/** Elements whose text content must not be scanned. */
const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);

/** A contiguous run of a single text node within the concatenated string. */
interface TextSegment {
  node: Text;
  /** Global start offset (inclusive) in the concatenated string. */
  start: number;
  /** Global end offset (exclusive). */
  end: number;
}

/** The concatenated text of a subtree plus the map back to DOM positions. */
export interface TextModel {
  text: string;
  segments: TextSegment[];
}

/** A match before it is assigned a document-order index. */
interface RawMatch {
  group: string;
  text: string;
  start: number;
  end: number;
  priority: number;
}

/**
 * Escape a literal string so it can be embedded in a `RegExp` and only match
 * itself. Covers every character with special meaning in a regex.
 */
export function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Return true if the text node should be included (no skipped ancestor). */
function isScannable(node: Text, root: HTMLElement): boolean {
  let el: Node | null = node.parentNode;
  while (el && el !== root.parentNode) {
    if (el.nodeType === 1 && SKIPPED_TAGS.has((el as Element).tagName)) {
      return false;
    }
    if (el === root) break;
    el = el.parentNode;
  }
  return true;
}

/**
 * Build the concatenated text of `root`'s subtree and the segment map. Text
 * nodes are concatenated directly (no separators), which is what lets a term
 * span adjacent inline elements such as `hello <b>world</b>`.
 */
export function buildTextModel(root: HTMLElement): TextModel {
  const segments: TextSegment[] = [];
  let text = '';
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node): number {
      return isScannable(node as Text, root) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  let current = walker.nextNode() as Text | null;
  while (current) {
    const data = current.data;
    if (data.length > 0) {
      const start = text.length;
      text += data;
      segments.push({ node: current, start, end: text.length });
    }
    current = walker.nextNode() as Text | null;
  }

  return { text, segments };
}

/**
 * Build one combined, global `RegExp` for a group by escaping literal terms,
 * using `RegExp` terms' sources as-is, and joining them with alternation.
 *
 * Note on `RegExp` terms: only the *source* is used. Per-term flags are ignored;
 * case sensitivity is governed by the group's `caseSensitive` option so all
 * terms in a group behave consistently.
 *
 * @returns the compiled RegExp, or `undefined` if the group has no usable terms.
 */
export function buildGroupRegExp(group: HighlightGroup): RegExp | undefined {
  const alternatives: string[] = [];

  for (const term of group.terms) {
    if (typeof term === 'string') {
      if (term.length > 0) alternatives.push(escapeRegExp(term));
    } else if (Array.isArray(term)) {
      for (const t of term) {
        if (typeof t === 'string' && t.length > 0) alternatives.push(escapeRegExp(t));
      }
    } else if (term instanceof RegExp) {
      if (term.source.length > 0) alternatives.push(`(?:${term.source})`);
    }
  }

  if (alternatives.length === 0) return undefined;

  let pattern = `(?:${alternatives.join('|')})`;
  if (group.wholeWord) {
    // `\b` is ASCII-only and will misbehave for non-Latin scripts (CJK, etc.).
    // This is documented in the README as a known limitation.
    pattern = `\\b${pattern}\\b`;
  }

  let flags = 'g';
  if (!group.caseSensitive) flags += 'i';
  // `u` is intentionally NOT added: RegExp term sources may contain constructs
  // that are invalid in unicode mode, and adding it would change escaping rules.

  return new RegExp(pattern, flags);
}

/** Run one group's regex over the text model, collecting raw matches. */
function collectGroupMatches(model: TextModel, group: HighlightGroup): RawMatch[] {
  const regex = buildGroupRegExp(group);
  if (!regex) return [];

  const priority = group.priority ?? 0;
  const out: RawMatch[] = [];
  let m: RegExpExecArray | null;

  regex.lastIndex = 0;
  while ((m = regex.exec(model.text)) !== null) {
    const matchText = m[0];
    if (matchText.length === 0) {
      // Zero-length match (e.g. a regex like `a*`): advance to avoid an infinite
      // loop and skip it — a zero-width highlight is meaningless.
      regex.lastIndex += 1;
      continue;
    }
    out.push({
      group: group.name,
      text: matchText,
      start: m.index,
      end: m.index + matchText.length,
      priority,
    });
  }

  return out;
}

/** Two half-open intervals overlap iff each starts before the other ends. */
function overlaps(a: RawMatch, b: RawMatch): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Resolve overlapping matches according to `strategy`. The returned list is
 * sorted in document order (ascending start, then ascending end).
 */
export function resolveOverlaps(matches: RawMatch[], strategy: OverlapStrategy): RawMatch[] {
  const byDocOrder = (a: RawMatch, b: RawMatch): number =>
    a.start - b.start || a.end - b.end || a.group.localeCompare(b.group);

  if (strategy === 'allow-overlap') {
    return [...matches].sort(byDocOrder);
  }

  // Order candidates by preference, then greedily accept non-overlapping ones.
  const candidates = [...matches];
  if (strategy === 'priority') {
    // Highest priority first; then earliest; then longest.
    candidates.sort((a, b) => b.priority - a.priority || a.start - b.start || b.end - a.end);
  } else {
    // first-match: earliest start first; ties broken by longer match.
    candidates.sort((a, b) => a.start - b.start || b.end - a.end);
  }

  const accepted: RawMatch[] = [];
  for (const cand of candidates) {
    if (!accepted.some((acc) => overlaps(acc, cand))) {
      accepted.push(cand);
    }
  }

  return accepted.sort(byDocOrder);
}

/**
 * Find the `(node, localOffset)` DOM position for a global offset.
 *
 * Segments are contiguous and cover `[0, text.length)`. A `start` offset
 * satisfies `seg.start <= offset < seg.end`; an `end` offset (exclusive)
 * satisfies `seg.start < offset <= seg.end`. The two rules resolve a boundary
 * between adjacent text nodes to the correct node for each end of a Range.
 *
 * @param atStart when true, resolve using the start rule; otherwise the end rule.
 */
function locate(
  segments: TextSegment[],
  offset: number,
  atStart: boolean
): { node: Text; offset: number } | undefined {
  let lo = 0;
  let hi = segments.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const seg = segments[mid]!;
    const contains = atStart
      ? offset >= seg.start && offset < seg.end
      : offset > seg.start && offset <= seg.end;
    if (contains) {
      return { node: seg.node, offset: offset - seg.start };
    }
    const goLeft = atStart ? offset < seg.start : offset <= seg.start;
    if (goLeft) {
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return undefined;
}

/** Build a live DOM `Range` for a global `[start, end)` interval. */
export function buildRange(
  doc: Document,
  segments: TextSegment[],
  start: number,
  end: number
): Range | undefined {
  const startPos = locate(segments, start, true);
  const endPos = locate(segments, end, false);
  if (!startPos || !endPos) return undefined;
  const range = doc.createRange();
  range.setStart(startPos.node, startPos.offset);
  range.setEnd(endPos.node, endPos.offset);
  return range;
}

/**
 * Full matching pass: build the text model, collect matches for every group,
 * resolve overlaps, and materialize `MatchInfo` (with live Ranges) in document
 * order.
 */
export function computeMatches(
  root: HTMLElement,
  groups: HighlightGroup[],
  overlapStrategy: OverlapStrategy
): { matches: MatchInfo[]; model: TextModel } {
  const model = buildTextModel(root);
  if (model.text.length === 0) {
    return { matches: [], model };
  }

  const raw: RawMatch[] = [];
  for (const group of groups) {
    raw.push(...collectGroupMatches(model, group));
  }

  const resolved = resolveOverlaps(raw, overlapStrategy);
  const doc = root.ownerDocument;
  const matches: MatchInfo[] = [];

  for (const r of resolved) {
    const range = buildRange(doc, model.segments, r.start, r.end);
    if (!range) continue;
    matches.push({
      group: r.group,
      text: r.text,
      start: r.start,
      end: r.end,
      index: matches.length,
      range,
    });
  }

  return { matches, model };
}
