/* Spiis /ny/menu: a bar of the categories that stays at the top while you
   scroll; a tap glides to the category, and the one you are in lights up.
   The category is worked out from where things are on the screen, once per
   frame, and only changes when it really changes – so it never flickers
   between two cards side by side. The bar itself slides sideways on its own
   and never moves the page. */
(() => {
  const bar = document.getElementById('nmBar'), wrap = document.getElementById('menuCategories');
  if (!bar || !wrap) return;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cats = [], links = [], cur = -1, lockUntil = 0, sig = '';

  function build() {
    cats = Array.from(wrap.querySelectorAll('.menucat'));
    const names = cats.map((c, i) => {
      c.id = c.id || `kat-${i}`;
      const h = c.querySelector('h4');
      const name = h ? Array.from(h.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim() : `Kategori ${i + 1}`;
      const ic = h && h.querySelector('.menucat__icon') ? h.querySelector('.menucat__icon').textContent : '';
      return [c.id, ic, name];
    });
    const now = JSON.stringify(names);
    if (now !== sig) {                       // only redraw the bar when the categories change
      sig = now;
      bar.innerHTML = names.map(([id, ic, name], i) => `<a href="#${id}" data-i="${i}"><span aria-hidden="true">${ic}</span>${name}</a>`).join('');
      links = Array.from(bar.querySelectorAll('a'));
      cur = -1;
    }
    update();
  }

  function setOn(i, slide = true) {
    if (i === cur) return;
    cur = i;
    links.forEach((a, k) => a.classList.toggle('on', k === i));
    const a = links[i];
    if (a && slide) {
      const left = a.offsetLeft - (bar.clientWidth - a.offsetWidth) / 2;
      bar.scrollTo({ left: Math.max(0, left), behavior: calm ? 'auto' : 'smooth' });
    }
  }

  // the category in use: find the row of cards under the line just below the
  // bar (on a computer two cards stand side by side). In a row of two, the
  // left one is in use for the first half of the row and the right one for
  // the second half, so the bar walks through every category in order.
  function update() {
    if (!cats.length || Date.now() < lockUntil) return;
    const line = bar.getBoundingClientRect().bottom + 24;
    const rows = [];
    cats.forEach((c, k) => {
      const r = c.getBoundingClientRect(), last = rows[rows.length - 1];
      if (last && Math.abs(last.top - r.top) < 8) { last.ids.push(k); last.bottom = Math.max(last.bottom, r.bottom); }
      else rows.push({ top: r.top, bottom: r.bottom, ids: [k] });
    });
    const row = rows.find((r) => r.bottom > line) || rows[rows.length - 1];
    const prog = Math.min(.999, Math.max(0, (line - row.top) / Math.max(1, row.bottom - row.top)));
    let i = row.ids[Math.floor(prog * row.ids.length)];
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) i = cats.length - 1;
    if (cats[0].getBoundingClientRect().top > innerHeight * .6) i = -1;   // not there yet
    if (i === -1) { if (cur !== -1) { cur = -1; links.forEach((a) => a.classList.remove('on')); } return; }
    setOn(i);
  }
  let raf = 0;
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); }, { passive: true });
  addEventListener('resize', update);

  // a tap: light it up at once and glide there, without the lights
  // running through every category on the way
  bar.addEventListener('click', (e) => {
    const a = e.target.closest('a'); if (!a) return;
    const i = +a.dataset.i, c = cats[i]; if (!c) return;
    e.preventDefault();
    setOn(i);
    lockUntil = Date.now() + (calm ? 50 : 900);
    const top = c.getBoundingClientRect().top + scrollY - (bar.getBoundingClientRect().bottom + 16);
    scrollTo({ top, behavior: calm ? 'auto' : 'smooth' });
    setTimeout(update, calm ? 60 : 950);
  });

  new MutationObserver(build).observe(wrap, { childList: true });
  build();
})();

/* the week on the menu page: the words without the small emoji in front
   (🚫 Lukket, 🗓️ Menuen …), so every row reads the same */
(() => {
  const el = document.getElementById('ugeMenu');
  if (!el) return;
  const clean = () => el.querySelectorAll('.ugerow__lukket, .ugerow__tom').forEach((s) => {
    const t = s.textContent.replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '');
    if (t !== s.textContent) s.textContent = t;
  });
  new MutationObserver(clean).observe(el, { childList: true, subtree: true }); clean();
})();
