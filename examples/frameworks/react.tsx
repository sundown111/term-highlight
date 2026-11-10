// React integration (React 18+). Illustrative: not compiled or executed by this repo's CI.
// The hook creates the highlighter after mount (browser only), keeps terms in sync, and
// destroys it on unmount. destroy() is idempotent, so React Strict Mode's extra
// mount/unmount cycle in development is safe.
import { useEffect, useRef, type RefObject } from 'react';
import { createHighlighter, type Highlighter, type HighlighterOptions } from 'term-highlight';

export function useTermHighlight(
  rootRef: RefObject<HTMLElement>,
  terms: string[],
  options: Omit<HighlighterOptions, 'root' | 'groups'> = {}
): RefObject<Highlighter | null> {
  const highlighter = useRef<Highlighter | null>(null);

  // Create once per root element.
  useEffect(() => {
    if (!rootRef.current) return;
    const h = createHighlighter({
      root: rootRef.current,
      groups: [{ name: 'search', terms }],
      autoUpdate: { debounce: 50 }, // follow React re-renders of the content
      ...options,
    });
    highlighter.current = h;
    return () => {
      h.destroy();
      highlighter.current = null;
    };
    // `terms` and `options` are applied by the effect below; recreate only if the root changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootRef]);

  // Push new terms without recreating the highlighter.
  useEffect(() => {
    highlighter.current?.setTerms('search', terms);
  }, [terms.join('\u0000')]); // eslint-disable-line react-hooks/exhaustive-deps

  return highlighter;
}

export function Article({ html, query }: { html: string; query: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const h = useTermHighlight(ref, query ? [query] : []);
  return (
    <>
      <button onClick={() => h.current?.next()}>Next</button>
      <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}
