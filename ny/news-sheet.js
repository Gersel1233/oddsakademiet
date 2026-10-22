/* Spiis /ny/: tap a news card and read it properly. The card opens in a
   sheet with the picture whole (a poster can be read), the full text, the
   deadline and the order button. Reads the cards main.js has drawn; the
   order button in the sheet presses the card's own button, so ordering
   works exactly as before. */
(() => {
  const grid = document.getElementById('newsGrid');
  if (!grid) return;
  const dlg = document.createElement('dialog');
  dlg.className = 'ny-sheet';
  dlg.setAttribute('aria-label', 'Nyhed');
  dlg.innerHTML = `<div class="ny-sheet__in">
      <button class="ny-sheet__x" type="button" aria-label="Luk"><svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>
      <figure class="ny-sheet__img" hidden><img alt="" /></figure>
      <div class="ny-sheet__body"><p class="ny-sheet__date"></p><h2 class="ny-sheet__title"></h2><p class="ny-sheet__text"></p><p class="ny-sheet__dl"></p><div class="ny-sheet__act"></div></div>
    </div>`;
  document.body.append(dlg);
  const $ = (s) => dlg.querySelector(s);
  const close = () => { dlg.close(); document.documentElement.classList.remove('ny-sheet-open'); };
  $('.ny-sheet__x').addEventListener('click', close);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  dlg.addEventListener('cancel', () => document.documentElement.classList.remove('ny-sheet-open'));

  function open(card) {
    const t = (sel) => card.querySelector(sel);
    const img = t('.news__media img');
    $('.ny-sheet__img').hidden = !img;
    if (img) { $('.ny-sheet__img img').src = img.currentSrc || img.src; $('.ny-sheet__img img').alt = img.alt; }
    $('.ny-sheet__date').textContent = t('.news__date')?.textContent || '';
    $('.ny-sheet__title').textContent = t('.news__title')?.textContent || '';
    $('.ny-sheet__text').textContent = t('.news__text')?.textContent || '';
    $('.ny-sheet__dl').textContent = t('.news__deadline')?.textContent || '';
    const act = $('.ny-sheet__act'); act.innerHTML = '';
    const cta = t('.news__cta'), shut = t('.news__closed');
    if (cta) {
      const b = document.createElement(cta.tagName === 'A' ? 'a' : 'button');
      b.className = 'btn btn--accent'; b.textContent = cta.textContent;
      if (cta.tagName === 'A') b.href = cta.getAttribute('href');
      b.addEventListener('click', (e) => { if (cta.tagName !== 'A') { e.preventDefault(); close(); cta.click(); } else close(); });
      act.append(b);
    } else if (shut) act.append(shut.cloneNode(true));
    dlg.showModal(); document.documentElement.classList.add('ny-sheet-open');
    dlg.querySelector('.ny-sheet__in').scrollTop = 0;
  }

  // "Læs mere" opens the sheet instead of folding the text
  grid.addEventListener('click', (e) => {
    const more = e.target.closest('[data-news-more]');
    const card = e.target.closest('.news');
    if (!card) return;
    if (more) { e.stopPropagation(); e.preventDefault(); open(card); return; }
    if (e.target.closest('a, button')) return;
    open(card);
  }, true);
  const mark = () => grid.querySelectorAll('.news').forEach((c) => {
    if (c.dataset.nySheet) return;
    c.dataset.nySheet = '1'; c.tabIndex = 0; c.setAttribute('role', 'button');
    c.setAttribute('aria-label', 'Læs: ' + (c.querySelector('.news__title')?.textContent || 'nyhed'));
    if (!c.querySelector('.news__more')) { const m = document.createElement('span'); m.className = 'news__more ny-read'; m.textContent = 'Læs hele opslaget →'; c.querySelector('.news__title')?.after(m); }
  });
  grid.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList?.contains('news')) open(e.target); });
  new MutationObserver(mark).observe(grid, { childList: true }); mark();
})();

/* each news picture gives its card its own shape – a tall phone poster up
   to 9:16, a wide picture as it is – so nothing is cut away */
(() => {
  const grid = document.getElementById('newsGrid');
  if (!grid) return;
  const fit = (img) => {
    const go = () => {
      if (!img.naturalWidth) return;
      const r = Math.max(9 / 16, Math.min(16 / 9, img.naturalWidth / img.naturalHeight));
      img.closest('.news__media')?.style.setProperty('--ar', String(r));
    };
    if (img.complete) go(); else img.addEventListener('load', go, { once: true });
  };
  const all = () => grid.querySelectorAll('.news__media img').forEach(fit);
  new MutationObserver(all).observe(grid, { childList: true, subtree: true }); all();
})();
