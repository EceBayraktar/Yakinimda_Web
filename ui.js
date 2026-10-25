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

  // Hızlı sıralama düğmeleri, soldaki "Sırala" menüsünü kullanır
  var sort = document.getElementById('sort');
  var pills = document.querySelectorAll('.quick [data-sort]');
  function mark() {
    pills.forEach(function (b) { b.classList.toggle('on', sort && b.dataset.sort === sort.value); });
  }
  pills.forEach(function (b) {
    b.addEventListener('click', function () {
      if (!sort) return;
      sort.value = b.dataset.sort;
      sort.dispatchEvent(new Event('input', { bubbles: true }));
      mark();
      var l = document.querySelector('.head');
      if (l && l.scrollIntoView) l.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  if (sort) sort.addEventListener('input', mark);
  mark();
})();