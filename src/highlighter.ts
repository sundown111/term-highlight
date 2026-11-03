import type {
  Highlighter,
  HighlighterOptions,
  HighlightGroup,
  HighlightGroupPatch,
  HighlightStats,
  MatchInfo,
  OverlapStrategy,
  ResolvedStrategy,
  Term,
} from './types.js';
import { computeMatches, type MatchOptions, type TextModel } from './matcher.js';
import type { Renderer, RendererContext } from './renderers/renderer.js';
import { createRenderer, resolveStrategy } from './renderers/detect.js';
import { debounce, nextInstanceId, scrollRectToCenter } from './utils.js';

const OBSERVER_CONFIG: MutationObserverInit = {
  childList: true,
  subtree: true,
  characterData: true,
};

function assertGroup(group: HighlightGroup): void {
  if (!group || typeof group.name !== 'string' || group.name.length === 0) {
    throw new TypeError('term-highlight: every group needs a non-empty string `name`.');
  }
  if (!Array.isArray(group.terms)) {
    throw new TypeError(`term-highlight: group "${group.name}" needs a \`terms\` array.`);
  }
}

class HighlighterImpl implements Highlighter {
  readonly activeStrategy: ResolvedStrategy;

  private readonly root: HTMLElement;
  private groups: HighlightGroup[];
  private readonly overlapStrategy: OverlapStrategy;
  private readonly matchOptions: MatchOptions;
  private readonly options: HighlighterOptions;
  private readonly renderer: Renderer;
  private readonly observer: MutationObserver | undefined;
  private readonly scheduleAutoUpdate: { (): void; cancel(): void };
  private readonly visible = new Map<string, boolean>();

  private matches: MatchInfo[] = [];
  private currentIndex = -1;
  private destroyed = false;

  constructor(options: HighlighterOptions) {
    if (!options || !options.root || options.root.nodeType !== 1) {
      throw new TypeError('createHighlighter: `root` must be an HTMLElement.');
    }
    if (!Array.isArray(options.groups)) {
      throw new TypeError('createHighlighter: `groups` must be an array.');
    }
    options.groups.forEach(assertGroup);

    this.options = options;
    this.root = options.root;
    // Own a copy so runtime group changes never mutate the caller's array.
    this.groups = options.groups.slice();
    this.overlapStrategy = options.overlapStrategy ?? 'priority';
    this.matchOptions = options.exclude ? { exclude: options.exclude } : {};
    for (const g of this.groups) this.visible.set(g.name, true);

    this.activeStrategy = resolveStrategy(options.strategy ?? 'auto', options.fallback);

    const ctx: RendererContext = {
      root: this.root,
      instanceId: nextInstanceId(),
      groups: this.groups,
      currentStyle: options.currentStyle ?? {},
      ...(options.onHighlightClick ? { onClick: options.onHighlightClick } : {}),
      ...(options.onHighlightHover ? { onHover: options.onHighlightHover } : {}),
    };
    this.renderer = createRenderer(this.activeStrategy, ctx);

    const auto = options.autoUpdate;
    const wait = typeof auto === 'object' ? Math.max(0, auto.debounce ?? 0) : 0;
    this.scheduleAutoUpdate = debounce(() => {
      if (!this.destroyed) this.update();
    }, wait);
    if (auto) {
      const MO =
        this.root.ownerDocument.defaultView?.MutationObserver ?? globalThis.MutationObserver;
      if (typeof MO === 'function') {
        this.observer = new MO(() => this.scheduleAutoUpdate());
      }
    }

    this.update();
  }

  // ---------------------------------------------------------------- matching

  update(): void {
    if (this.destroyed) return;
    this.observer?.disconnect();

    const previous = this.current;

    // Undo any previous rendering first so matching runs against the clean,
    // original DOM and captured node references stay valid through render.
    this.renderer.clear();

    const { matches, model } = computeMatches(
      this.root,
      this.groups,
      this.overlapStrategy,
      this.matchOptions
    );
    this.matches = matches;
    this.currentIndex = -1;
    this.render(model);

    // Keep the user's place across re-matches (live content, typing, toggles).
    if (previous) {
      const same = matches.find(
        (m) => m.group === previous.group && m.start === previous.start && m.end === previous.end
      );
      if (same && this.isGroupVisible(same.group)) {
        this.currentIndex = same.index;
        this.renderer.setCurrent(same);
      }
    }

    if (this.observer) this.observer.observe(this.root, OBSERVER_CONFIG);

    this.options.onUpdate?.(this.getMatches(), this.getStats());
    if (previous && this.currentIndex === -1) {
      this.options.onCurrentChange?.(undefined, this.getStats());
    }
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

  getStats(): HighlightStats {
    const byGroup: Record<string, number> = {};
    for (const g of this.groups) byGroup[g.name] = 0;
    let visible = 0;
    let position = 0;
    for (const m of this.matches) {
      byGroup[m.group] = (byGroup[m.group] ?? 0) + 1;
      if (this.isGroupVisible(m.group)) {
        visible += 1;
        if (m.index === this.currentIndex) position = visible;
      }
    }
    return { total: this.matches.length, visible, position, byGroup };
  }

  getMatchAt(clientX: number, clientY: number): MatchInfo | undefined {
    return this.renderer.matchAtPoint(clientX, clientY);
  }

  // ------------------------------------------------------------------ groups

  getGroups(): HighlightGroup[] {
    return this.groups.map((g) => ({ ...g, terms: g.terms.slice() }));
  }

  setTerms(name: string, terms: Term[]): void {
    if (this.groups.some((g) => g.name === name)) {
      this.updateGroup(name, { terms });
    } else {
      this.addGroup({ name, terms });
    }
  }

  addGroup(group: HighlightGroup): void {
    assertGroup(group);
    const next = this.groups.filter((g) => g.name !== group.name);
    next.push({ ...group });
    if (!this.visible.has(group.name)) this.visible.set(group.name, true);
    this.replaceGroups(next);
  }

  removeGroup(name: string): boolean {
    if (!this.groups.some((g) => g.name === name)) return false;
    this.visible.delete(name);
    this.replaceGroups(this.groups.filter((g) => g.name !== name));
    return true;
  }

  updateGroup(name: string, patch: HighlightGroupPatch): void {
    const index = this.groups.findIndex((g) => g.name === name);
    if (index === -1) {
      throw new Error(`term-highlight: no group named "${name}".`);
    }
    const next = this.groups.slice();
    next[index] = { ...next[index]!, ...patch, name };
    assertGroup(next[index]!);
    this.replaceGroups(next);
  }

  clear(): void {
    this.visible.clear();
    this.replaceGroups([]);
  }

  private replaceGroups(groups: HighlightGroup[]): void {
    if (this.destroyed) return;
    // Clear while the renderer still knows the old groups so every old
    // registry entry / wrapper is removed.
    this.renderer.clear();
    this.groups = groups;
    this.renderer.setGroups(groups);
    this.update();
  }

  // -------------------------------------------------------------- visibility

  isGroupVisible(name: string): boolean {
    return this.visible.get(name) !== false;
  }

  toggleGroup(name: string, on?: boolean): void {
    this.setVisible(name, on ?? !this.isGroupVisible(name));
    this.dropHiddenCurrent();
  }

  toggleAll(on?: boolean): void {
    for (const g of this.groups) this.setVisible(g.name, on ?? !this.isGroupVisible(g.name));
    this.dropHiddenCurrent();
  }

  showOnly(name: string): void {
    for (const g of this.groups) this.setVisible(g.name, g.name === name);
    this.dropHiddenCurrent();
  }

  showAll(): void {
    this.toggleAll(true);
  }

  private setVisible(name: string, on: boolean): void {
    this.visible.set(name, on);
    this.renderer.setGroupVisible(name, on);
  }

  /** A hidden match can't be "current": clear it so it doesn't paint. */
  private dropHiddenCurrent(): void {
    const current = this.current;
    if (current && !this.isGroupVisible(current.group)) this.setCurrentMatch(undefined, false);
  }

  // -------------------------------------------------------------- navigation

  get current(): MatchInfo | undefined {
    return this.currentIndex >= 0 ? this.matches[this.currentIndex] : undefined;
  }

  next(): MatchInfo | undefined {
    return this.move(1);
  }

  previous(): MatchInfo | undefined {
    return this.move(-1);
  }

  goTo(index: number): MatchInfo | undefined {
    const target = this.matches[index];
    if (!target || !this.isGroupVisible(target.group)) return undefined;
    this.setCurrentMatch(target, true);
    return target;
  }

  clearCurrent(): void {
    this.setCurrentMatch(undefined, false);
  }

  private move(delta: number): MatchInfo | undefined {
    const visibleMatches = this.matches.filter((m) => this.isGroupVisible(m.group));
    if (visibleMatches.length === 0) {
      this.setCurrentMatch(undefined, false);
      return undefined;
    }

    // Find where the current match sits within the visible subset.
    const current = this.current;
    let pos = current ? visibleMatches.findIndex((m) => m.index === current.index) : -1;
    if (pos === -1) {
      pos = delta > 0 ? 0 : visibleMatches.length - 1;
    } else {
      pos = (pos + delta + visibleMatches.length) % visibleMatches.length;
    }

    const target = visibleMatches[pos]!;
    this.setCurrentMatch(target, true);
    return target;
  }

  private setCurrentMatch(match: MatchInfo | undefined, scroll: boolean): void {
    const changed = (match?.index ?? -1) !== this.currentIndex;
    this.currentIndex = match ? match.index : -1;
    this.renderer.setCurrent(match);
    if (match && scroll) this.scrollToMatch(match);
    if (changed) this.options.onCurrentChange?.(match, this.getStats());
  }

  /**
   * Center the match in its nearest scroll container (or the window). The
   * target position comes from the match's own rect rather than calling
   * `scrollIntoView` on an ancestor element, which would center the whole
   * paragraph instead of the match.
   */
  private scrollToMatch(match: MatchInfo): void {
    const behavior = this.options.scroll ?? 'smooth';
    if (behavior === false) return;
    const rect = this.renderer.getMatchRect(match);
    if (!rect) return;
    // Start from the match itself so scroll containers nested inside the root
    // are found. (dom-span replaces the original text nodes, so fall back to root.)
    const node = match.range.startContainer;
    const el = node.nodeType === 1 ? (node as Element) : node.parentElement;
    const origin = el && this.root.contains(el) ? el : this.root;
    scrollRectToCenter(origin, rect, behavior);
  }

  // ---------------------------------------------------------------- teardown

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scheduleAutoUpdate.cancel();
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
