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
