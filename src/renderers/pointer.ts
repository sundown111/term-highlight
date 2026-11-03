import type { MatchInfo } from '../types.js';
import type { RendererContext } from './renderer.js';

/** Resolves the match (if any) a pointer event is over. */
export type MatchPicker = (event: MouseEvent) => MatchInfo | undefined;

/**
 * Wire click and hover callbacks on the root. Listeners are only added for
 * callbacks that were provided. Hover hit-testing is throttled to one check per
 * animation frame. Returns a function that removes everything it added.
 */
export function attachPointerHandlers(ctx: RendererContext, pick: MatchPicker): () => void {
  const root = ctx.root;
  const view = root.ownerDocument.defaultView;
  const cleanups: Array<() => void> = [];

  if (ctx.onClick) {
    const onClick = (event: MouseEvent): void => {
      const match = pick(event);
      if (match) ctx.onClick?.(match, event);
    };
    root.addEventListener('click', onClick);
    cleanups.push(() => root.removeEventListener('click', onClick));
  }

  if (ctx.onHover) {
    let hovered: MatchInfo | undefined;
    let pending: MouseEvent | undefined;
    let frame: number | undefined;
    const raf = view?.requestAnimationFrame?.bind(view);
    const caf = view?.cancelAnimationFrame?.bind(view);

    const emit = (match: MatchInfo | undefined, event: MouseEvent): void => {
      if (match?.index === hovered?.index && match?.group === hovered?.group) return;
      hovered = match;
      ctx.onHover?.(match, event);
    };
    const check = (): void => {
      frame = undefined;
      if (pending) emit(pick(pending), pending);
      pending = undefined;
    };
    const onMove = (event: MouseEvent): void => {
      pending = event;
      if (!raf) return check();
      if (frame === undefined) frame = raf(check);
    };
    const onLeave = (event: MouseEvent): void => {
      if (frame !== undefined) caf?.(frame);
      frame = undefined;
      pending = undefined;
      emit(undefined, event);
    };

    root.addEventListener('mousemove', onMove);
    root.addEventListener('mouseleave', onLeave);
    cleanups.push(() => {
      if (frame !== undefined) caf?.(frame);
      root.removeEventListener('mousemove', onMove);
      root.removeEventListener('mouseleave', onLeave);
    });
  }

  return () => {
    for (const fn of cleanups) fn();
  };
}

interface CaretDocument {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
}

/** The text position under a viewport point, if the browser can tell us. */
function caretAt(doc: Document, x: number, y: number): { node: Node; offset: number } | undefined {
  const d = doc as unknown as CaretDocument;
  try {
    if (typeof d.caretPositionFromPoint === 'function') {
      const pos = d.caretPositionFromPoint(x, y);
      if (pos) return { node: pos.offsetNode, offset: pos.offset };
    } else if (typeof d.caretRangeFromPoint === 'function') {
      const range = d.caretRangeFromPoint(x, y);
      if (range) return { node: range.startContainer, offset: range.startOffset };
    }
  } catch {
    // Fall through to the rect scan.
  }
  return undefined;
}

function rangeContainsPoint(range: Range, x: number, y: number): boolean {
  if (typeof range.getClientRects !== 'function') return false;
  const rects = range.getClientRects();
  for (let r = 0; r < rects.length; r++) {
    const rect = rects[r]!;
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return true;
  }
  return false;
}

/**
 * Hit-test a viewport point against match Ranges without relying on elements.
 *
 * When the browser exposes a caret-from-point API, candidates are first
 * narrowed with `Range.isPointInRange` (no layout work), then confirmed against
 * client rects. Otherwise every match's rects are scanned. Later matches win
 * ties, so higher-priority / nested matches are reported first.
 */
export function hitTestRanges(
  doc: Document,
  matches: readonly MatchInfo[],
  x: number,
  y: number,
  isVisible: (match: MatchInfo) => boolean
): MatchInfo | undefined {
  const caret = caretAt(doc, x, y);
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i]!;
    if (!isVisible(match)) continue;
    if (caret && typeof match.range.isPointInRange === 'function') {
      let inside = false;
      try {
        inside = match.range.isPointInRange(caret.node, caret.offset);
      } catch {
        inside = true; // different root or detached node: let the rect check decide
      }
      // isPointInRange includes both boundaries, so either half of an edge
      // character still counts.
      if (!inside) continue;
    }
    if (rangeContainsPoint(match.range, x, y)) return match;
  }
  return undefined;
}
