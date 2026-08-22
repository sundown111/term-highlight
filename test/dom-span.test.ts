import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHighlighter } from '../src/index.js';
import type { Highlighter } from '../src/index.js';

let active: Highlighter | undefined;

function root(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  active?.destroy();
  active = undefined;
  document.body.innerHTML = '';
});

describe('dom-span renderer', () => {
  it('wraps matches in <mark> with group metadata', () => {
    const el = root('the cat sat');
    active = createHighlighter({
      root: el,
      strategy: 'dom-span',
      groups: [{ name: 'animals', terms: ['cat'] }],
    });
    const marks = el.querySelectorAll('mark[data-th-instance]');
    expect(marks).toHaveLength(1);
    expect(marks[0]!.textContent).toBe('cat');
    expect(marks[0]!.getAttribute('data-group')).toBe('animals');
    expect(el.textContent).toBe('the cat sat');
  });

  it('wraps a phrase crossing element boundaries as one mark per segment', () => {
    const el = root('say <i>hello</i> <b>world</b> now');
    active = createHighlighter({
      root: el,
      strategy: 'dom-span',
      groups: [{ name: 'g', terms: ['hello world'] }],
    });
    const marks = el.querySelectorAll('mark[data-match-index="0"]');
    // "hello", " ", "world" => three text segments across <i>, root, <b>.
    expect(marks.length).toBe(3);
    expect(Array.from(marks, (m) => m.textContent).join('')).toBe('hello world');
    expect(el.textContent).toBe('say hello world now');
  });

  it('nests overlapping matches from different groups (allow-overlap)', () => {
    const el = root('abcdef');
    active = createHighlighter({
      root: el,
      strategy: 'dom-span',
      overlapStrategy: 'allow-overlap',
      groups: [
        { name: 'A', terms: ['abc'] },
        { name: 'B', terms: ['cde'] },
      ],
    });
    expect(el.querySelectorAll('mark[data-group="A"]').length).toBeGreaterThan(0);
    expect(el.querySelectorAll('mark[data-group="B"]').length).toBeGreaterThan(0);
    // Text content must be preserved exactly despite nesting.
    expect(el.textContent).toBe('abcdef');
  });

  it('toggles a group without re-matching, preserving text', () => {
    const el = root('cat dog cat');
    active = createHighlighter({
      root: el,
      strategy: 'dom-span',
      groups: [
        { name: 'cats', terms: ['cat'] },
        { name: 'dogs', terms: ['dog'] },
      ],
    });
    const catMark = el.querySelector('mark[data-group="cats"]')!;
    const styleClass = Array.from(catMark.classList).find((c) => /-g\d+$/.test(c))!;
    expect(catMark.classList.contains(styleClass)).toBe(true);

    active.toggleGroup('cats', false);
    expect(catMark.classList.contains(styleClass)).toBe(false);
    // Marks remain in the DOM (text intact); only styling class is removed.
    expect(el.querySelectorAll('mark[data-group="cats"]').length).toBe(2);
    expect(el.textContent).toBe('cat dog cat');

    active.toggleGroup('cats', true);
    expect(catMark.classList.contains(styleClass)).toBe(true);
  });

  it('showOnly displays one group and hides the rest', () => {
    const el = root('cat dog');
    active = createHighlighter({
      root: el,
      strategy: 'dom-span',
      groups: [
        { name: 'cats', terms: ['cat'] },
        { name: 'dogs', terms: ['dog'] },
      ],
    });
    active.showOnly('dogs');
    const catMark = el.querySelector('mark[data-group="cats"]')!;
    const dogMark = el.querySelector('mark[data-group="dogs"]')!;
    expect(Array.from(catMark.classList).some((c) => /-g\d+$/.test(c))).toBe(false);
    expect(Array.from(dogMark.classList).some((c) => /-g\d+$/.test(c))).toBe(true);
  });

  it('next/previous move a current marker through matches in document order', () => {
    const el = root('cat cat cat');
    active = createHighlighter({
      root: el,
      strategy: 'dom-span',
      groups: [{ name: 'c', terms: ['cat'] }],
    });
    const curClass = (): HTMLElement | null => el.querySelector('mark[class*="-cur"]');

    const first = active.next();
    expect(first?.index).toBe(0);
    expect(curClass()?.getAttribute('data-match-index')).toBe('0');

    const second = active.next();
    expect(second?.index).toBe(1);

    const back = active.previous();
    expect(back?.index).toBe(0);

    // Wrap-around backwards from first goes to last.
    const wrapped = active.previous();
    expect(wrapped?.index).toBe(2);
    // Only one current marker at a time.
    expect(el.querySelectorAll('mark[class*="-cur"]').length).toBe(1);
  });

  it('fires onHighlightClick with the clicked match', () => {
    const el = root('find the cat here');
    const onClick = vi.fn();
    active = createHighlighter({
      root: el,
      strategy: 'dom-span',
      groups: [{ name: 'c', terms: ['cat'] }],
      onHighlightClick: onClick,
    });
    const mark = el.querySelector('mark[data-group="c"]')!;
    mark.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]![0].group).toBe('c');
    expect(onClick.mock.calls[0]![0].text).toBe('cat');
  });

  it('re-runs matching on update() after DOM changes', () => {
    const el = root('one cat');
    active = createHighlighter({
      root: el,
      strategy: 'dom-span',
      groups: [{ name: 'c', terms: ['cat'] }],
    });
    expect(el.querySelectorAll('mark').length).toBe(1);

    // Add more matchable content (append to the trailing text, not inside a mark).
    el.appendChild(document.createTextNode(' and another cat'));
    active.update();
    expect(el.querySelectorAll('mark').length).toBe(2);
    expect(el.textContent).toBe('one cat and another cat');
  });

  it('destroy() unwraps all marks, removes styles, and restores text', () => {
    const el = root('a cat and a cat');
    active = createHighlighter({
      root: el,
      strategy: 'dom-span',
      groups: [{ name: 'c', terms: ['cat'] }],
    });
    expect(el.querySelectorAll('mark').length).toBe(2);
    expect(document.head.querySelectorAll('style[data-th-instance]').length).toBe(1);

    active.destroy();
    active = undefined;

    expect(el.querySelectorAll('mark').length).toBe(0);
    expect(document.head.querySelectorAll('style[data-th-instance]').length).toBe(0);
    expect(el.textContent).toBe('a cat and a cat');
    // No leftover split text nodes.
    expect(el.childNodes.length).toBe(1);
  });
});
