import type { HighlightGroup, MatchInfo } from '../types.js';
import type { TextModel } from '../matcher.js';
import type { Renderer, RendererContext } from './renderer.js';
import { attachPointerHandlers, hitTestRanges } from './pointer.js';

/**
 * Renderer that paints nothing and never touches the document: no elements,
 * no `<style>` tag, no registry entries. Matching, navigation, stats, and
 * pointer callbacks still work, so you can drive your own UI (e.g. a result
 * list or a minimap) or degrade gracefully where the CSS Custom Highlight API
 * is missing without ever mutating the DOM.
 */
export class NoneRenderer implements Renderer {
  readonly name = 'none' as const;

  private readonly ctx: RendererContext;
  private readonly visible = new Map<string, boolean>();
  private readonly detachPointer: () => void;
  private matches: MatchInfo[] = [];

  constructor(ctx: RendererContext) {
    this.ctx = ctx;
    this.detachPointer = attachPointerHandlers(ctx, (e) => this.matchAtPoint(e.clientX, e.clientY));
  }

  render(matches: MatchInfo[], _model: TextModel): void {
    this.matches = matches;
  }

  setGroups(groups: HighlightGroup[]): void {
    this.ctx.groups = groups;
  }

  setGroupVisible(name: string, visible: boolean): void {
    this.visible.set(name, visible);
  }

  setCurrent(_match: MatchInfo | undefined): void {}

  matchAtPoint(x: number, y: number): MatchInfo | undefined {
    return hitTestRanges(
      this.ctx.root.ownerDocument,
      this.matches,
      x,
      y,
      (m) => this.visible.get(m.group) !== false
    );
  }

  getMatchRect(match: MatchInfo): DOMRect | null {
    if (typeof match.range.getBoundingClientRect !== 'function') return null;
    return match.range.getBoundingClientRect();
  }

  clear(): void {
    this.matches = [];
  }

  destroy(): void {
    this.detachPointer();
    this.matches = [];
  }
}
