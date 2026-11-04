/** Options for {@link parseQuery}. */
export interface ParseQueryOptions {
  /**
   * Treat tokens written as `/pattern/flags` as regular expressions. Invalid
   * patterns fall back to literal text. Defaults to `false` so arbitrary user
   * input can never produce a pathological regex.
   */
  allowRegex?: boolean;
  /** Ignore tokens shorter than this many characters. Defaults to `1`. */
  minLength?: number;
}

/**
 * Turn search-box text into terms, the way most search UIs read input:
 *
 * - words separated by whitespace become separate terms: `red fox` → `['red', 'fox']`
 * - `"double"` or `'single'` quotes keep a phrase together: `"red fox"` → `['red fox']`
 * - with `allowRegex`, `/colou?r/` becomes a `RegExp`
 *
 * Duplicates are removed (case-insensitively for literals). An unterminated
 * quote runs to the end of the input, so results stay stable while typing.
 */
export function parseQuery(query: string, options: ParseQueryOptions = {}): Array<string | RegExp> {
  const minLength = Math.max(1, options.minLength ?? 1);
  const out: Array<string | RegExp> = [];
  const seen = new Set<string>();
  const push = (term: string | RegExp): void => {
    const key = typeof term === 'string' ? `s:${term.toLowerCase()}` : `r:${String(term)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(term);
  };

  const text = String(query ?? '');
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const close = text.indexOf(ch, i + 1);
      const end = close === -1 ? text.length : close;
      const phrase = text
        .slice(i + 1, end)
        .replace(/\s+/g, ' ')
        .trim();
      if (phrase.length >= minLength) push(phrase);
      i = end + 1;
      continue;
    }

    let end = i;
    while (end < text.length && !/\s/.test(text[end]!)) end += 1;
    const token = text.slice(i, end);
    i = end;

    if (options.allowRegex) {
      const re = /^\/(.+)\/([a-z]*)$/.exec(token);
      if (re) {
        try {
          push(new RegExp(re[1]!, re[2]));
          continue;
        } catch {
          // Not a valid pattern: treat it as literal text below.
        }
      }
    }
    if (token.length >= minLength) push(token);
  }

  return out;
}
