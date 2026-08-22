import type { HighlightGroup, MatchInfo } from '../types.js';
import type { TextModel } from '../matcher.js';
import type { Renderer, RendererContext } from './renderer.js';
import { styleToCssText } from '../utils.js';
import {
  getHighlightConstructor,
  getHighlightRegistry,
  type HighlightConstructor,
  type HighlightRegistryLike,
  type HighlightLike,
} from '../css-highlight-api.js';

/** Priority offset that keeps the "current" highlight painted above all groups. */
const CURRENT_PRIORITY = 1_000_000;

/**
 * Renderer that paints matches with the CSS Custom Highlight API. It never
 * mutates the DOM tree being highlighted: it registers `Highlight` objects in
 * `CSS.highlights` and injects a single `<style>` element with `::highlight()`
 * rules.
 */
export class CssHighlightRenderer implements Renderer {
  readonly name = 'css-highlight' as const;

  private readonly ctx: RendererContext;
  private readonly Highlight: HighlightConstructor;
  private readonly registry: HighlightRegistryLike;
  private readonly groupConfig = new Map<string, HighlightGroup>();

  /** group name -> its registered Highlight object (kept even when hidden). */
  private readonly highlights = new Map<string, HighlightLike>();
  private readonly visible = new Map<string, boolean>();
  private matches: MatchInfo[] = [];

  private styleEl: HTMLStyleElement | undefined;
  private readonly currentHighlight: HighlightLike;
  private readonly clickListener: (event: MouseEvent) => void;

  constructor(ctx: RendererContext) {
    const Ctor = getHighlightConstructor();
    const registry = getHighlightRegistry();
    if (!Ctor || !registry) {
      throw new Error('CSS Custom Highlight API is not available in this environment.');
    }
    this.ctx = ctx;
    this.Highlight = Ctor;
    this.registry = registry;
    for (const g of ctx.groups) this.groupConfig.set(g.name, g);

    this.currentHighlight = new Ctor();
    this.currentHighlight.priority = CURRENT_PRIORITY;

    this.clickListener = (event: MouseEvent): void => this.handleClick(event);
    ctx.root.addEventListener('click', this.clickListener);
  }

  private groupKey(name: string): string {
    return `${this.ctx.instanceId}-g-${name}`;
  }

  private currentKey(): string {
    return `${this.ctx.instanceId}-current`;
  }

  render(matches: MatchInfo[], _model: TextModel): void {
    this.clearRegistry();
    this.matches = matches;
    this.highlights.clear();
    this.currentHighlight.clear();

    // Group ranges by group name.
    const byGroup = new Map<string, MatchInfo[]>();
    for (const m of matches) {
      let list = byGroup.get(m.group);
      if (!list) {
        list = [];
        byGroup.set(m.group, list);
      }
      list.push(m);
    }

    for (const group of this.ctx.groups) {
      const groupMatches = byGroup.get(group.name);
      const highlight = new this.Highlight();
      highlight.priority = group.priority ?? 0;
      if (groupMatches) {
        for (const m of groupMatches) highlight.add(m.range);
      }
      this.highlights.set(group.name, highlight);
      // Default to visible unless a prior toggle set it hidden.
      if (!this.visible.has(group.name)) this.visible.set(group.name, true);
      if (this.visible.get(group.name)) {
        this.registry.set(this.groupKey(group.name), highlight);
      }
    }

    this.injectStyles();
  }

  setGroupVisible(name: string, visible: boolean): void {
    this.visible.set(name, visible);
    const highlight = this.highlights.get(name);
    if (!highlight) return;
    if (visible) {
      this.registry.set(this.groupKey(name), highlight);
    } else {
      this.registry.delete(this.groupKey(name));
    }
  }

  setCurrent(match: MatchInfo | undefined): void {
    this.currentHighlight.clear();
    if (match) {
      this.currentHighlight.add(match.range);
      this.registry.set(this.currentKey(), this.currentHighlight);
    } else {
      this.registry.delete(this.currentKey());
    }
  }

  getMatchRect(match: MatchInfo): DOMRect | null {
    if (typeof match.range.getBoundingClientRect !== 'function') return null;
    return match.range.getBoundingClientRect();
  }

  clear(): void {
    this.clearRegistry();
    this.registry.delete(this.currentKey());
    this.currentHighlight.clear();
    this.highlights.clear();
    this.matches = [];
  }

  destroy(): void {
    this.ctx.root.removeEventListener('click', this.clickListener);
    this.clearRegistry();
    this.registry.delete(this.currentKey());
    this.highlights.clear();
    this.matches = [];
    if (this.styleEl?.parentNode) {
      this.styleEl.parentNode.removeChild(this.styleEl);
    }
    this.styleEl = undefined;
  }

  private clearRegistry(): void {
    for (const group of this.ctx.groups) {
      this.registry.delete(this.groupKey(group.name));
    }
  }

  private injectStyles(): void {
    const doc = this.ctx.root.ownerDocument;
    if (!this.styleEl) {
      this.styleEl = doc.createElement('style');
      this.styleEl.setAttribute('data-th-instance', this.ctx.instanceId);
      doc.head.appendChild(this.styleEl);
    }
    const rules: string[] = [];
    for (const group of this.ctx.groups) {
      const css = styleToCssText(group.style) || 'background-color: yellow;';
      rules.push(`::highlight(${this.groupKey(group.name)}) { ${css} }`);
    }
    const currentCss =
      styleToCssText(this.ctx.currentStyle) || 'background-color: #ff9632; color: black;';
    // Declared last so it wins over group rules for the current match.
    rules.push(`::highlight(${this.currentKey()}) { ${currentCss} }`);
    this.styleEl.textContent = rules.join('\n');
  }

  /**
   * Hit-test a click against every visible match's client rects.
   *
   * We intentionally do NOT use `CSS.highlights` + `highlightsFromPoint()`:
   * as of 2025 `highlightsFromPoint()` is only shipping in Chromium and is
   * absent in Firefox and Safari, so we rely on `Range.getClientRects()`
   * point-in-rect testing, which works in every browser that supports the
   * Highlight API. (Re-verify this note before switching to the native API.)
   */
  private handleClick(event: MouseEvent): void {
    if (!this.ctx.onClick) return;
    const x = event.clientX;
    const y = event.clientY;
    // Iterate in reverse so higher-priority / later matches win ties visually.
    for (let i = this.matches.length - 1; i >= 0; i--) {
      const match = this.matches[i]!;
      if (this.visible.get(match.group) === false) continue;
      if (typeof match.range.getClientRects !== 'function') continue;
      const rects = match.range.getClientRects();
      for (let r = 0; r < rects.length; r++) {
        const rect = rects[r]!;
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          this.ctx.onClick(match);
          return;
        }
      }
    }
  }
}
