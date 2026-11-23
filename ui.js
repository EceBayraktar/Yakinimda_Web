// Arayüz: aydınlık/karanlık tema düğmesi ve hızlı sıralama düğmeleri
(function () {
  var root = document.documentElement;
  var btn = document.getElementById('theme');
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function current() {
    var t = root.getAttribute('data-theme');
    return t || (mq && mq.matches ? 'dark' : 'light');
  }
  function paint() {
    if (!btn) return;
    var dark = current() === 'dark';
    btn.textContent = dark ? '☀️' : '🌙';
    btn.setAttribute('aria-label', dark ? 'Aydınlık moda geç' : 'Karanlık moda geç');
    btn.title = dark ? 'Aydınlık mod' : 'Karanlık mod';
  }
  if (btn) btn.addEventListener('click', function () {
    var next = current() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('yakinimda_tema', next); } catch (e) {}
    paint();
  });
  if (mq && mq.addEventListener) mq.addEventListener('change', paint);
  paint();

  // Mutfak menüsü: kategori seçimini yan filtreyle senkronlar ve hemen uygular.
  var pills = document.querySelectorAll('.quick [data-cuisine]');
  function markCuisine() {
    var checked = document.querySelectorAll('#cuisines input:checked');
    var cuisines = Array.prototype.map.call(checked, function (i) { return i.value; });
    pills.forEach(function (b) {
      var active = b.dataset.cuisine === 'all'
        ? cuisines.length === 0
        : cuisines.length === 1 && cuisines[0] === b.dataset.cuisine;
      b.classList.toggle('on', active);
    });
  }
  pills.forEach(function (b) {
    b.addEventListener('click', function () {
      var cuisine = b.dataset.cuisine;
      document.querySelectorAll('#cuisines input').forEach(function (i) {
        i.checked = cuisine !== 'all' && i.value === cuisine;
      });
      markCuisine();
      var apply = document.getElementById('apply');
      if (apply) apply.click();
      var l = document.querySelector('.map-wrap');
      if (l && l.scrollIntoView) l.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  document.getElementById('cuisines')?.addEventListener('change', markCuisine);
  markCuisine();
})();