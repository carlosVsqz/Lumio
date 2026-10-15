(function () {
  var theme = 'light';
  try { if (localStorage.getItem('lumio.theme.v1') === 'dark') theme = 'dark'; } catch (_) {}
  document.documentElement.dataset.theme = theme;
  var color = document.querySelector('meta[name="theme-color"]');
  if (color) color.setAttribute('content', theme === 'dark' ? '#141a17' : '#ffffff');
})();
