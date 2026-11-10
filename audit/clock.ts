// &at=<ISO time> starts the page's clock there, for screenshots taken
// without Playwright's clock. Imported first, before anything reads the time.
const at = new URLSearchParams(location.search).get('at');
if (at && Number.isFinite(Date.parse(at))) {
  const real = Date.now.bind(Date);
  const shift = Date.parse(at) - real();
  Date.now = () => real() + shift;
}

export {};
