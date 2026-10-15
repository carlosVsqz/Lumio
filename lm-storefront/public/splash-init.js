(function () {
  var splash = document.getElementById('brand-splash');
  if (!splash) return;
  var finished = false;
  var fallback;
  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(fallback);
    splash.classList.add('is-leaving');
    document.removeEventListener('lumio:ready', finish);
    document.removeEventListener('keydown', finish, true);
    document.removeEventListener('pointerdown', finish, true);
    window.setTimeout(function () { splash.hidden = true; }, 180);
  }
  // Decorative only: never takes focus, captures a click or waits for the catalog API.
  splash.hidden = false;
  document.addEventListener('lumio:ready', finish, {once: true});
  document.addEventListener('keydown', finish, {once: true, capture: true});
  document.addEventListener('pointerdown', finish, {once: true, capture: true});
  splash.querySelector('img').addEventListener('error', finish, {once: true});
  fallback = window.setTimeout(finish, 3000);
})();
