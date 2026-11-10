/**
 * Minimal, self-contained typing for the CSS Custom Highlight API.
 *
 * We deliberately do NOT rely on `lib.dom.d.ts` declaring `Highlight` /
 * `CSS.highlights`, because those declarations are only present in newer
 * TypeScript versions and would cause "duplicate identifier" conflicts if we
 * declared them globally ourselves. Instead we look the API up at runtime
 * through `globalThis` and expose narrow, locally-typed accessors.
 *
 * Browser support (verified against MDN, 2025): the CSS Custom Highlight API
 * (`Highlight`, `CSS.highlights`, `::highlight()`) is supported in Chrome/Edge
 * 105+, Safari 17.2+, and Firefox 140+. `HighlightRegistry` behaves like a
 * `Map<string, Highlight>`.
 */

/** A `Highlight` instance — an ordered set of `Range`s painted together. */
export interface HighlightLike {
  priority: number;
  size: number;
  add(range: Range): HighlightLike;
  delete(range: Range): boolean;
  clear(): void;
  has(range: Range): boolean;
  forEach(callback: (range: Range) => void): void;
}

/** The `Highlight` constructor. */
export interface HighlightConstructor {
  new (...ranges: Range[]): HighlightLike;
}

/** The `CSS.highlights` registry (a `Map`-like keyed by highlight name). */
export interface HighlightRegistryLike {
  set(name: string, highlight: HighlightLike): HighlightRegistryLike;
  get(name: string): HighlightLike | undefined;
  delete(name: string): boolean;
  has(name: string): boolean;
  clear(): void;
}

interface CssWithHighlights {
  highlights?: HighlightRegistryLike;
}

/** Returns the `Highlight` constructor if available in this environment. */
export function getHighlightConstructor(): HighlightConstructor | undefined {
  const ctor = (globalThis as unknown as { Highlight?: unknown }).Highlight;
  return typeof ctor === 'function' ? (ctor as HighlightConstructor) : undefined;
}

/** Returns the `CSS.highlights` registry if available in this environment. */
export function getHighlightRegistry(): HighlightRegistryLike | undefined {
  const css = (globalThis as unknown as { CSS?: CssWithHighlights }).CSS;
  return css?.highlights as HighlightRegistryLike | undefined;
}

/**
 * Feature-detect the CSS Custom Highlight API. Both the `Highlight`
 * constructor and the `CSS.highlights` registry must be present.
 */
export function supportsCssHighlight(): boolean {
  const Ctor = getHighlightConstructor();
  const registry = getHighlightRegistry();
  if (!Ctor || !registry) return false;
  // Partial implementations (e.g. a polyfill stub) must not be mistaken for the real thing.
  return (
    typeof registry.set === 'function' &&
    typeof registry.delete === 'function' &&
    typeof Ctor.prototype?.add === 'function'
  );
}
