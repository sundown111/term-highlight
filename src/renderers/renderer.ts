import type { HighlightGroup, MatchInfo } from '../types.js';
import type { TextModel } from '../matcher.js';

/** Context shared with a renderer at construction time. */
export interface RendererContext {
  root: HTMLElement;
  instanceId: string;
  groups: HighlightGroup[];
  currentStyle: Partial<CSSStyleDeclaration>;
  onClick?: (match: MatchInfo, event: MouseEvent) => void;
  onHover?: (match: MatchInfo | undefined, event: MouseEvent) => void;
}

/**
 * A rendering strategy. Renderers own everything they add to the page (registry
 * entries, wrapper elements, `<style>` tags, listeners) and must fully remove it
 * on {@link Renderer.destroy}.
 */
export interface Renderer {
  readonly name: 'css-highlight' | 'dom-span' | 'none';
  /**
   * Render the given matches, replacing anything previously rendered.
   * @param matches resolved matches in document order
   * @param model the text model (used by `dom-span` to locate node segments)
   */
  render(matches: MatchInfo[], model: TextModel): void;
  /** Show or hide one group's highlights without re-matching. */
  setGroupVisible(name: string, visible: boolean): void;
  /** Mark a single match as the "current" one (or clear it with `undefined`). */
  setCurrent(match: MatchInfo | undefined): void;
  /**
   * Replace the group configuration. Called between `clear()` and the next
   * `render()` when groups are added, removed, or changed at runtime.
   */
  setGroups(groups: HighlightGroup[]): void;
  /** The visible match under a viewport point, if any. */
  matchAtPoint(x: number, y: number): MatchInfo | undefined;
  /** Bounding client rect of a rendered match, or `null` if not measurable. */
  getMatchRect(match: MatchInfo): DOMRect | null;
  /**
   * Undo the current rendering (registry entries / wrapper elements) so the DOM
   * is clean, while keeping the renderer usable for a subsequent `render`. Used
   * by `update()` before re-matching so node references are not invalidated.
   */
  clear(): void;
  /** Remove everything this renderer added and release references. */
  destroy(): void;
}
