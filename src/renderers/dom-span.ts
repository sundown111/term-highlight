import type { HighlightGroup, MatchInfo } from '../types.js';
import type { TextModel } from '../matcher.js';
import type { Renderer, RendererContext } from './renderer.js';
import { styleToCssText } from '../utils.js';

/** A slice of a single text node covered by one match. */
interface Piece {
  start: number;
  end: number;
  match: MatchInfo;
}

/**
 * Renderer that wraps matches in `<mark>` elements. A match that spans multiple
 * text nodes is wrapped as one fragment per node segment, all sharing the same
 * `data-match-index` and `data-group`. Overlapping matches (with the
 * `allow-overlap` strategy) are nested. This is the fallback used when the CSS
 * Custom Highlight API is unavailable.
 */
export class DomSpanRenderer implements Renderer {
  readonly name = 'dom-span' as const;

  private readonly ctx: RendererContext;
  private readonly doc: Document;
  private readonly groupConfig = new Map<string, HighlightGroup>();
  private readonly groupClass = new Map<string, string>();
  private readonly visible = new Map<string, boolean>();

  private readonly matchSpans = new Map<number, HTMLElement[]>();
  private readonly groupSpans = new Map<string, HTMLElement[]>();
  private readonly matchesByIndex = new Map<number, MatchInfo>();
  private currentIndex: number | undefined;

  private styleEl: HTMLStyleElement | undefined;
  private readonly clickListener: (event: MouseEvent) => void;

  constructor(ctx: RendererContext) {
    this.ctx = ctx;
    this.doc = ctx.root.ownerDocument;
    ctx.groups.forEach((g, i) => {
      this.groupConfig.set(g.name, g);
      this.groupClass.set(g.name, `${ctx.instanceId}-g${i}`);
      if (!this.visible.has(g.name)) this.visible.set(g.name, true);
    });
    this.clickListener = (event: MouseEvent): void => this.handleClick(event);
    ctx.root.addEventListener('click', this.clickListener);
  }

  private currentClass(): string {
    return `${this.ctx.instanceId}-cur`;
  }

  clear(): void {
    this.unwrapAll();
    this.matchSpans.clear();
    this.groupSpans.clear();
    this.matchesByIndex.clear();
    this.currentIndex = undefined;
  }

  render(matches: MatchInfo[], model: TextModel): void {
    // Assume the DOM is already clean (Highlighter calls clear() before
    // re-matching). Reset our own bookkeeping in case render is called directly.
    this.matchSpans.clear();
    this.groupSpans.clear();
    this.matchesByIndex.clear();
    this.currentIndex = undefined;
    this.injectStyles();

    // Group all match slices by their owning text node. Computing every slice
    // before mutating means each node is touched exactly once, so node
    // references never get invalidated mid-pass.
    const perNode = new Map<Text, Piece[]>();
    for (const m of matches) {
      this.matchesByIndex.set(m.index, m);
      for (const seg of model.segments) {
        if (seg.start >= m.end) break; // segments are sorted; no further overlap
        if (seg.end <= m.start) continue;
        const start = Math.max(m.start, seg.start) - seg.start;
        const end = Math.min(m.end, seg.end) - seg.start;
        if (end > start) {
          let arr = perNode.get(seg.node);
          if (!arr) {
            arr = [];
            perNode.set(seg.node, arr);
          }
          arr.push({ start, end, match: m });
        }
      }
    }

    for (const [node, pieces] of perNode) {
      this.wrapNode(node, pieces);
    }
  }

  private wrapNode(node: Text, pieces: Piece[]): void {
    const parent = node.parentNode;
    if (!parent) return;
    const text = node.data;

    // Elementary intervals defined by every piece boundary.
    const cuts = new Set<number>([0, text.length]);
    for (const p of pieces) {
      cuts.add(p.start);
      cuts.add(p.end);
    }
    const points = [...cuts].sort((a, b) => a - b);

    const frag = this.doc.createDocumentFragment();
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!;
      const b = points[i + 1]!;
      if (a === b) continue;
      const slice = text.slice(a, b);
      const covering = pieces.filter((p) => p.start <= a && p.end >= b);
      if (covering.length === 0) {
        frag.appendChild(this.doc.createTextNode(slice));
        continue;
      }
      // Nest deterministically: lower match index on the outside.
      covering.sort((x, y) => x.match.index - y.match.index);
      let inner: Node = this.doc.createTextNode(slice);
      for (let k = covering.length - 1; k >= 0; k--) {
        const span = this.createSpan(covering[k]!.match);
        span.appendChild(inner);
        inner = span;
      }
      frag.appendChild(inner);
    }

    parent.replaceChild(frag, node);
  }

  private createSpan(match: MatchInfo): HTMLElement {
    const el = this.doc.createElement('mark');
    el.setAttribute('data-th-instance', this.ctx.instanceId);
    el.setAttribute('data-group', match.group);
    el.setAttribute('data-match-index', String(match.index));

    const classes: string[] = [];
    if (this.visible.get(match.group) !== false) {
      const cls = this.groupClass.get(match.group);
      if (cls) classes.push(cls);
    }
    const custom = this.groupConfig.get(match.group)?.className;
    if (custom) classes.push(custom);
    if (classes.length) el.className = classes.join(' ');

    let mList = this.matchSpans.get(match.index);
    if (!mList) {
      mList = [];
      this.matchSpans.set(match.index, mList);
    }
    mList.push(el);

    let gList = this.groupSpans.get(match.group);
    if (!gList) {
      gList = [];
      this.groupSpans.set(match.group, gList);
    }
    gList.push(el);

    return el;
  }

  setGroupVisible(name: string, visible: boolean): void {
    this.visible.set(name, visible);
    const cls = this.groupClass.get(name);
    const spans = this.groupSpans.get(name);
    if (!cls || !spans) return;
    for (const span of spans) {
      if (visible) span.classList.add(cls);
      else span.classList.remove(cls);
    }
  }

  setCurrent(match: MatchInfo | undefined): void {
    const cur = this.currentClass();
    if (this.currentIndex !== undefined) {
      for (const span of this.matchSpans.get(this.currentIndex) ?? []) {
        span.classList.remove(cur);
      }
    }
    this.currentIndex = match?.index;
    if (match) {
      for (const span of this.matchSpans.get(match.index) ?? []) {
        span.classList.add(cur);
      }
    }
  }

  getMatchRect(match: MatchInfo): DOMRect | null {
    const spans = this.matchSpans.get(match.index);
    if (!spans || spans.length === 0) return null;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const span of spans) {
      const r = span.getBoundingClientRect();
      left = Math.min(left, r.left);
      top = Math.min(top, r.top);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    }
    if (!Number.isFinite(left)) return null;
    return new DOMRect(left, top, right - left, bottom - top);
  }

  destroy(): void {
    this.ctx.root.removeEventListener('click', this.clickListener);
    this.unwrapAll();
    this.matchSpans.clear();
    this.groupSpans.clear();
    this.matchesByIndex.clear();
    this.currentIndex = undefined;
    if (this.styleEl?.parentNode) {
      this.styleEl.parentNode.removeChild(this.styleEl);
    }
    this.styleEl = undefined;
  }

  /** Remove every wrapper this instance created, restoring the original text. */
  private unwrapAll(): void {
    const selector = `mark[data-th-instance="${this.ctx.instanceId}"]`;
    const marks = this.ctx.root.querySelectorAll<HTMLElement>(selector);
    for (const mark of Array.from(marks)) {
      // Replacing a mark with its children keeps any nested marks in the DOM;
      // they are also in this NodeList and get unwrapped on their own turn.
      mark.replaceWith(...Array.from(mark.childNodes));
    }
    // Merge the text nodes we split back together.
    this.ctx.root.normalize();
  }

  private injectStyles(): void {
    if (!this.styleEl) {
      this.styleEl = this.doc.createElement('style');
      this.styleEl.setAttribute('data-th-instance', this.ctx.instanceId);
      this.doc.head.appendChild(this.styleEl);
    }
    const id = this.ctx.instanceId;
    const rules: string[] = [
      // Neutralize the UA <mark> styling so a hidden group shows plain text.
      `mark[data-th-instance="${id}"] { background-color: transparent; color: inherit; }`,
    ];
    this.ctx.groups.forEach((group) => {
      const cls = this.groupClass.get(group.name)!;
      const css = styleToCssText(group.style) || 'background-color: yellow;';
      rules.push(`mark[data-th-instance="${id}"].${cls} { ${css} }`);
    });
    const currentCss =
      styleToCssText(this.ctx.currentStyle) || 'background-color: #ff9632; color: black;';
    // Declared last so it wins over group rules for the current match.
    rules.push(`mark[data-th-instance="${id}"].${this.currentClass()} { ${currentCss} }`);
    this.styleEl.textContent = rules.join('\n');
  }

  private handleClick(event: MouseEvent): void {
    if (!this.ctx.onClick) return;
    const target = event.target as Element | null;
    const mark = target?.closest<HTMLElement>(
      `mark[data-th-instance="${this.ctx.instanceId}"][data-match-index]`
    );
    if (!mark) return;
    const index = Number(mark.getAttribute('data-match-index'));
    const match = this.matchesByIndex.get(index);
    if (match) this.ctx.onClick(match);
  }
}
