import type {
  Highlighter,
  HighlighterOptions,
  HighlightGroup,
  MatchInfo,
  OverlapStrategy,
  Strategy,
} from './types.js';
import { computeMatches, type TextModel } from './matcher.js';
import type { Renderer, RendererContext } from './renderers/renderer.js';
import { createRenderer, resolveStrategy } from './renderers/detect.js';
import { nextInstanceId } from './utils.js';

const OBSERVER_CONFIG: MutationObserverInit = {
  childList: true,
  subtree: true,
  characterData: true,
};

class HighlighterImpl implements Highlighter {
  readonly activeStrategy: Exclude<Strategy, 'auto'>;

  private readonly root: HTMLElement;
  private readonly groups: HighlightGroup[];
  private readonly overlapStrategy: OverlapStrategy;
  private readonly renderer: Renderer;
  private readonly observer: MutationObserver | undefined;
  private readonly visible = new Map<string, boolean>();

  private matches: MatchInfo[] = [];
  private currentIndex = -1;
  private destroyed = false;
  private autoUpdateScheduled = false;

  constructor(options: HighlighterOptions) {
    if (!options || !options.root || options.root.nodeType !== 1) {
      throw new TypeError('createHighlighter: `root` must be an HTMLElement.');
    }
    if (!Array.isArray(options.groups)) {
      throw new TypeError('createHighlighter: `groups` must be an array.');
    }

    this.root = options.root;
    this.groups = options.groups;
    this.overlapStrategy = options.overlapStrategy ?? 'priority';
    for (const g of this.groups) this.visible.set(g.name, true);

    this.activeStrategy = resolveStrategy(options.strategy ?? 'auto');

    const ctx: RendererContext = {
      root: this.root,
      instanceId: nextInstanceId(),
      groups: this.groups,
      currentStyle: options.currentStyle ?? {},
      ...(options.onHighlightClick ? { onClick: options.onHighlightClick } : {}),
    };
    this.renderer = createRenderer(this.activeStrategy, ctx);

    if (options.autoUpdate) {
      const MO =
        this.root.ownerDocument.defaultView?.MutationObserver ?? globalThis.MutationObserver;
      if (typeof MO === 'function') {
        this.observer = new MO(() => this.scheduleAutoUpdate());
      }
    }

    this.update();
  }

  update(): void {
    if (this.destroyed) return;
    this.observer?.disconnect();

    // Undo any previous rendering first so matching runs against the clean,
    // original DOM and captured node references stay valid through render.
    this.renderer.clear();

    const { matches, model } = computeMatches(this.root, this.groups, this.overlapStrategy);
    this.matches = matches;
    this.currentIndex = -1;
    this.render(model);

    if (this.observer) this.observer.observe(this.root, OBSERVER_CONFIG);
  }

  private render(model: TextModel): void {
    this.renderer.render(this.matches, model);
    // Re-apply any non-default visibility that was set before this pass.
    for (const [name, on] of this.visible) {
      if (!on) this.renderer.setGroupVisible(name, false);
    }
  }

  getMatches(groupName?: string): MatchInfo[] {
    if (groupName === undefined) return this.matches.slice();
    return this.matches.filter((m) => m.group === groupName);
  }

  toggleGroup(name: string, on?: boolean): void {
    const next = on ?? !(this.visible.get(name) ?? true);
    this.visible.set(name, next);
    this.renderer.setGroupVisible(name, next);
  }

  toggleAll(on?: boolean): void {
    for (const g of this.groups) {
      const next = on ?? !(this.visible.get(g.name) ?? true);
      this.visible.set(g.name, next);
      this.renderer.setGroupVisible(g.name, next);
    }
  }

  showOnly(name: string): void {
    for (const g of this.groups) {
      const on = g.name === name;
      this.visible.set(g.name, on);
      this.renderer.setGroupVisible(g.name, on);
    }
  }

  showAll(): void {
    this.toggleAll(true);
  }

  next(): MatchInfo | undefined {
    return this.move(1);
  }

  previous(): MatchInfo | undefined {
    return this.move(-1);
  }

  private move(delta: number): MatchInfo | undefined {
    const visibleMatches = this.matches.filter((m) => this.visible.get(m.group) !== false);
    if (visibleMatches.length === 0) {
      this.currentIndex = -1;
      this.renderer.setCurrent(undefined);
      return undefined;
    }

    // Find where the current match sits within the visible subset.
    const current = this.currentIndex >= 0 ? this.matches[this.currentIndex] : undefined;
    let pos = current ? visibleMatches.findIndex((m) => m.index === current.index) : -1;
    if (pos === -1) {
      pos = delta > 0 ? 0 : visibleMatches.length - 1;
    } else {
      pos = (pos + delta + visibleMatches.length) % visibleMatches.length;
    }

    const target = visibleMatches[pos]!;
    this.currentIndex = target.index;
    this.renderer.setCurrent(target);
    this.scrollIntoViewCentered(target);
    return target;
  }

  /**
   * Scroll the match to the vertical center of the viewport. The target scroll
   * position is computed from the match's own bounding rect rather than calling
   * `scrollIntoView` on an ancestor, so it works regardless of scroll container.
   */
  private scrollIntoViewCentered(match: MatchInfo): void {
    const view = this.root.ownerDocument.defaultView;
    if (!view || typeof view.scrollTo !== 'function') return;
    const rect = this.renderer.getMatchRect(match);
    if (!rect) return;
    const absoluteTop = rect.top + view.scrollY;
    const target = absoluteTop - view.innerHeight / 2 + rect.height / 2;
    try {
      view.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    } catch {
      // Some environments (e.g. jsdom) don't implement scrollTo; ignore.
    }
  }

  private scheduleAutoUpdate(): void {
    if (this.autoUpdateScheduled || this.destroyed) return;
    this.autoUpdateScheduled = true;
    queueMicrotask(() => {
      this.autoUpdateScheduled = false;
      if (!this.destroyed) this.update();
    });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.observer?.disconnect();
    this.renderer.destroy();
    this.matches = [];
    this.currentIndex = -1;
  }
}

/** Create a highlighter over `options.root`. Matching runs immediately. */
export function createHighlighter(options: HighlighterOptions): Highlighter {
  return new HighlighterImpl(options);
}
