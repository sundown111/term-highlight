/**
 * A minimal in-memory implementation of the CSS Custom Highlight API for use in
 * jsdom, which does not implement it. Faithful enough to exercise the
 * `css-highlight` renderer: a `Highlight` set-of-ranges and a `Map`-like
 * `CSS.highlights` registry.
 */

export class FakeHighlight {
  priority = 0;
  size = 0;
  private readonly ranges = new Set<Range>();

  constructor(...ranges: Range[]) {
    for (const r of ranges) this.add(r);
  }

  add(range: Range): this {
    this.ranges.add(range);
    this.size = this.ranges.size;
    return this;
  }

  delete(range: Range): boolean {
    const deleted = this.ranges.delete(range);
    this.size = this.ranges.size;
    return deleted;
  }

  clear(): void {
    this.ranges.clear();
    this.size = 0;
  }

  has(range: Range): boolean {
    return this.ranges.has(range);
  }

  forEach(cb: (range: Range) => void): void {
    this.ranges.forEach(cb);
  }
}

export class FakeHighlightRegistry {
  readonly map = new Map<string, FakeHighlight>();

  set(name: string, highlight: FakeHighlight): this {
    this.map.set(name, highlight);
    return this;
  }
  get(name: string): FakeHighlight | undefined {
    return this.map.get(name);
  }
  delete(name: string): boolean {
    return this.map.delete(name);
  }
  has(name: string): boolean {
    return this.map.has(name);
  }
  clear(): void {
    this.map.clear();
  }
  get size(): number {
    return this.map.size;
  }
}

/** Install the fake API onto `globalThis` and return the registry. */
export function installFakeHighlightApi(): FakeHighlightRegistry {
  const registry = new FakeHighlightRegistry();
  (globalThis as any).Highlight = FakeHighlight;
  const css = ((globalThis as any).CSS ??= {});
  css.highlights = registry;
  return registry;
}

/** Remove the fake API from `globalThis`. */
export function uninstallFakeHighlightApi(): void {
  delete (globalThis as any).Highlight;
  if ((globalThis as any).CSS) delete (globalThis as any).CSS.highlights;
}
