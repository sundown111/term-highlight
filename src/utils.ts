/** Small shared helpers with no DOM side effects. */

/** Convert a camelCase CSS property name to its kebab-case form. */
export function camelToKebab(prop: string): string {
  return prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/^-ms-/, '-ms-');
}

/**
 * Serialize a partial `CSSStyleDeclaration`-like object into a CSS declaration
 * body (e.g. `background-color: yellow; color: black;`). Numeric-indexed and
 * function-valued keys and empty values are skipped.
 */
export function styleToCssText(style: Partial<CSSStyleDeclaration> | undefined): string {
  if (!style) return '';
  const parts: string[] = [];
  for (const key of Object.keys(style)) {
    if (/^\d+$/.test(key)) continue; // numeric index accessors on CSSStyleDeclaration
    const value = (style as Record<string, unknown>)[key];
    if (value == null || typeof value === 'function') continue;
    const text = String(value);
    if (text.length === 0) continue;
    parts.push(`${camelToKebab(key)}: ${text};`);
  }
  return parts.join(' ');
}

/** Monotonic counter for generating unique per-instance ids within a page. */
let instanceCounter = 0;

/** Generate a short unique id used to namespace highlight names / classes. */
export function nextInstanceId(): string {
  instanceCounter += 1;
  return `th${instanceCounter}`;
}

/**
 * Escape a string for use as a CSS identifier, e.g. inside `::highlight()`.
 * Uses `CSS.escape` when present; otherwise a conservative fallback that
 * escapes everything outside `[A-Za-z0-9_-]` and a leading digit.
 */
export function cssEscapeIdent(value: string): string {
  const css = (globalThis as unknown as { CSS?: { escape?: (v: string) => string } }).CSS;
  if (typeof css?.escape === 'function') return css.escape(value);
  return value
    .replace(/[^A-Za-z0-9_-]/g, (c) => `\\${c.codePointAt(0)!.toString(16)} `)
    .replace(/^(-?)(\d)/, (_m, dash: string, d: string) => `${dash}\\3${d} `);
}

/** The nearest ancestor (starting at `el`) that scrolls vertically, if any. */
export function findScrollParent(el: Element | null): HTMLElement | undefined {
  const view = el?.ownerDocument.defaultView;
  if (!view || typeof view.getComputedStyle !== 'function') return undefined;
  const docEl = el?.ownerDocument.documentElement;
  for (let node: Element | null = el; node && node !== docEl; node = node.parentElement) {
    const { overflowY } = view.getComputedStyle(node);
    if (
      (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
      node.scrollHeight > node.clientHeight
    ) {
      return node as HTMLElement;
    }
  }
  return undefined;
}

/**
 * Vertically center `rect` (viewport coordinates) inside the nearest scrollable
 * ancestor of `from`, or the window if there is none.
 */
export function scrollRectToCenter(
  from: Element,
  rect: DOMRect,
  behavior: 'smooth' | 'auto' | 'instant'
): void {
  const view = from.ownerDocument.defaultView;
  if (!view) return;
  const container = findScrollParent(from);
  const scrollBehavior = behavior as ScrollBehavior;
  try {
    if (container) {
      const box = container.getBoundingClientRect();
      const delta = rect.top - box.top - container.clientHeight / 2 + rect.height / 2;
      container.scrollTo({
        top: Math.max(0, container.scrollTop + delta),
        behavior: scrollBehavior,
      });
      // The container itself may be off-screen; bring the match into the window too.
      const after = rect.top - delta;
      if (after < 0 || after > view.innerHeight) {
        view.scrollTo({
          top: Math.max(0, after + view.scrollY - view.innerHeight / 2),
          behavior: scrollBehavior,
        });
      }
      return;
    }
    if (typeof view.scrollTo !== 'function') return;
    const target = rect.top + view.scrollY - view.innerHeight / 2 + rect.height / 2;
    view.scrollTo({ top: Math.max(0, target), behavior: scrollBehavior });
  } catch {
    // Some environments (e.g. jsdom) don't implement scrolling; ignore.
  }
}

/** Run `fn` at most once per `wait` ms of quiet. `wait <= 0` uses a microtask. */
export function debounce(fn: () => void, wait: number): { (): void; cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let queued = false;
  let cancelled = false;
  const run = (): void => {
    if (wait <= 0) {
      if (queued) return;
      queued = true;
      cancelled = false;
      queueMicrotask(() => {
        queued = false;
        if (!cancelled) fn();
      });
      return;
    }
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn();
    }, wait);
  };
  run.cancel = (): void => {
    cancelled = true;
    queued = false;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  return run;
}
