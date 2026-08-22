import { describe, it, expect } from 'vitest';
import { camelToKebab, styleToCssText } from '../src/utils.js';

describe('camelToKebab', () => {
  it('converts camelCase to kebab-case', () => {
    expect(camelToKebab('backgroundColor')).toBe('background-color');
    expect(camelToKebab('color')).toBe('color');
    expect(camelToKebab('textDecorationLine')).toBe('text-decoration-line');
  });
});

describe('styleToCssText', () => {
  it('serializes a partial style object to a CSS declaration body', () => {
    const css = styleToCssText({ backgroundColor: 'yellow', color: 'black' });
    expect(css).toBe('background-color: yellow; color: black;');
  });

  it('returns an empty string for undefined or empty input', () => {
    expect(styleToCssText(undefined)).toBe('');
    expect(styleToCssText({})).toBe('');
  });

  it('skips null, empty, numeric-index, and function values', () => {
    const style = {
      color: 'red',
      background: '',
      textShadow: undefined,
      0: 'color', // numeric index accessor present on real CSSStyleDeclaration
      getPropertyValue: () => 'x',
    } as unknown as Partial<CSSStyleDeclaration>;
    expect(styleToCssText(style)).toBe('color: red;');
  });
});
