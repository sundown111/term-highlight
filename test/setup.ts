// jsdom does not implement layout/scrolling. Provide harmless no-ops so code
// paths that call them don't emit "Not implemented" noise during tests.
if (typeof window !== 'undefined') {
  window.scrollTo = (() => {}) as typeof window.scrollTo;
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}
