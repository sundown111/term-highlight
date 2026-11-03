import type { Highlighter, HighlightGroup, HighlightStats, MatchInfo } from './types.js';
import { parseQuery, type ParseQueryOptions } from './query.js';
import { debounce } from './utils.js';

/** Options for {@link connectSearchInput}. */
export interface SearchInputOptions
  extends Partial<Omit<HighlightGroup, 'name' | 'terms'>>, ParseQueryOptions {
  /** Group the input controls. Created if missing. Defaults to `'search'`. */
  group?: string;
  /**
   * `'words'` (default) splits input with {@link parseQuery} (quotes keep
   * phrases together); `'phrase'` treats the whole input as one literal.
   */
  mode?: 'words' | 'phrase';
  /** Wait this many ms after typing stops before re-matching. Defaults to `120`. */
  debounce?: number;
  /** Make the first match current (and scroll to it) after each search. Defaults to `true`. */
  jumpToFirst?: boolean;
  /**
   * Keyboard shortcuts while the input has focus: Enter → next, Shift+Enter →
   * previous, Escape → clear. Defaults to `true`.
   */
  keyboard?: boolean;
  /**
   * Called after every search and every navigation, e.g. to show "3 of 12".
   * Receives the current match (if any) and stats for the search group only.
   */
  onChange?: (stats: HighlightStats, current: MatchInfo | undefined) => void;
}

/** Handle returned by {@link connectSearchInput}. */
export interface SearchInputConnection {
  /** Go to the next match of this input's group (what Enter does). */
  next(): void;
  /** Go to the previous match of this input's group (what Shift+Enter does). */
  previous(): void;
  /** Re-read the input's value and search now (skips the debounce). */
  refresh(): void;
  /** Clear the input and the highlights it produced. */
  reset(): void;
  /** Stop listening. Leaves the highlighter and its other groups untouched. */
  disconnect(): void;
}

/**
 * Wire an `<input>` / `<textarea>` to a highlighter: typing highlights matches
 * live, Enter / Shift+Enter step through them, Escape clears. Only the input's
 * own group is touched, so it composes with other always-on groups.
 *
 * ```ts
 * const h = createHighlighter({ root: article, groups: [] });
 * connectSearchInput(searchBox, h, {
 *   onChange: (s) => (counter.textContent = s.visible ? `${s.position} of ${s.visible}` : 'No results'),
 * });
 * ```
 */
export function connectSearchInput(
  input: HTMLInputElement | HTMLTextAreaElement,
  highlighter: Highlighter,
  options: SearchInputOptions = {}
): SearchInputConnection {
  const {
    group = 'search',
    mode = 'words',
    debounce: wait = 120,
    jumpToFirst = true,
    keyboard = true,
    onChange,
    allowRegex,
    minLength,
    ...groupOptions
  } = options;

  if (!highlighter.getGroups().some((g) => g.name === group)) {
    highlighter.addGroup({ priority: 10, ...groupOptions, name: group, terms: [] });
  } else if (Object.keys(groupOptions).length > 0) {
    highlighter.updateGroup(group, groupOptions);
  }

  const report = (): void => {
    if (!onChange) return;
    const all = highlighter.getStats();
    const current = highlighter.current;
    const mine = highlighter.getMatches(group);
    const position =
      current && current.group === group ? mine.findIndex((m) => m.index === current.index) + 1 : 0;
    const count = all.byGroup[group] ?? 0;
    onChange(
      {
        total: count,
        visible: highlighter.isGroupVisible(group) ? count : 0,
        position,
        byGroup: { [group]: count },
      },
      current && current.group === group ? current : undefined
    );
  };

  /** Step through this input's matches only, ignoring other groups. */
  const step = (delta: 1 | -1): void => {
    const mine = highlighter.getMatches(group);
    if (mine.length === 0 || !highlighter.isGroupVisible(group)) return report();
    const current = highlighter.current;
    let pos = current ? mine.findIndex((m) => m.index === current.index) : -1;
    if (pos === -1) {
      // Continue from wherever the current match (of any group) is in the document.
      pos =
        delta > 0
          ? mine.findIndex((m) => !current || m.start > current.start)
          : findLastIndex(mine, (m) => !current || m.start < current.start);
      if (pos === -1) pos = delta > 0 ? 0 : mine.length - 1;
    } else {
      pos = (pos + delta + mine.length) % mine.length;
    }
    highlighter.goTo(mine[pos]!.index);
    report();
  };

  let lastQuery: string | undefined;
  const search = (): void => {
    const value = input.value;
    if (value === lastQuery) return;
    lastQuery = value;
    const terms =
      mode === 'phrase'
        ? value.trim().length >= Math.max(1, minLength ?? 1)
          ? [value.trim()]
          : []
        : parseQuery(value, {
            ...(allowRegex !== undefined ? { allowRegex } : {}),
            ...(minLength !== undefined ? { minLength } : {}),
          });
    // Like browser find-in-page: refine the search without losing your place.
    const anchor = highlighter.current;
    highlighter.setTerms(group, terms);
    const mine = highlighter.getMatches(group);
    if (jumpToFirst && mine.length > 0 && highlighter.isGroupVisible(group)) {
      const target = mine.find((m) => !anchor || m.start >= anchor.start) ?? mine[0]!;
      highlighter.goTo(target.index);
    }
    report();
  };

  const scheduled = debounce(search, wait);
  const onInput = (): void => scheduled();
  const onKeyDown = (event: Event): void => {
    const e = event as KeyboardEvent;
    if (e.isComposing) return; // don't hijack IME confirmation
    if (e.key === 'Enter' && input.tagName !== 'TEXTAREA') {
      e.preventDefault();
      scheduled.cancel();
      search(); // make sure pending typing is applied before navigating
      step(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape' && input.value !== '') {
      e.preventDefault();
      reset();
    }
  };

  input.addEventListener('input', onInput);
  if (keyboard) input.addEventListener('keydown', onKeyDown);

  function reset(): void {
    scheduled.cancel();
    input.value = '';
    lastQuery = undefined;
    search();
  }

  if (input.value) search();

  const flush = (): void => {
    scheduled.cancel();
    search(); // apply any pending typing before navigating
  };

  return {
    next(): void {
      flush();
      step(1);
    },
    previous(): void {
      flush();
      step(-1);
    },
    refresh(): void {
      scheduled.cancel();
      lastQuery = undefined;
      search();
    },
    reset,
    disconnect(): void {
      scheduled.cancel();
      input.removeEventListener('input', onInput);
      input.removeEventListener('keydown', onKeyDown);
    },
  };
}

function findLastIndex<T>(list: readonly T[], pred: (item: T) => boolean): number {
  for (let i = list.length - 1; i >= 0; i--) if (pred(list[i]!)) return i;
  return -1;
}
