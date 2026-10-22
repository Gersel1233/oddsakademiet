/* Spiis /ny/: the day, live. Reads what the page's own script has already
   put on the page (today's dish, price, portions left, open now, order
   until) and shows it in the card at the top and the dock at the bottom.
   It only reads; ordering and data are untouched. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const txt = (s) => ($(s) && !$(s).hidden ? $(s).textContent.replace(/\s+/g, ' ').trim() : '');
  const set = (s, v) => $$(s).forEach((e) => { if (e.textContent !== v) e.textContent = v; });
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  function state() {
    const st = txt('#openStatus');
    if (!st) return { on: null, label: 'Spiis' };
    const first = st.replace(/^[●•\s]+/, '').split(/\s[–-]\s/)[0];
    const on = /åbent|bestil/i.test(first) && !/lukket/i.test(first);
    return { on, label: first, rest: st.split(/\s[–-]\s/).slice(1).join(' – ') };
  }

  function paint() {
    const dish = txt('#todayDish');
    const s = state();
    const stock = txt('#todayStock');
    const left = (stock.match(/\d+/) || [])[0];
    const soldout = /udsolgt/i.test(stock);
    // the card at the top
    set('.nl-state', s.on === null ? 'Indlæser…' : (s.on ? 'Åbent nu' : s.label));
    set('.nl-dish', dish && !/indlæser/i.test(dish) ? dish : 'Dagens ret følger snart');
    set('.nl-desc', txt('#todayDesc'));
    // the price as a figure: the number large, "kr." small
    const price = txt('#todayPrice'), pn = (price.match(/[\d.,]+/) || [])[0];
    const pEl = $('.nl-price');
    if (pEl) { const h = pn ? `<b>${pn}</b><small>kr.</small>` : ''; if (pEl.innerHTML !== h) pEl.innerHTML = h; }
    // portions left, and how far the day has come: from the kitchen's own numbers
    let total = null;
    try {
      const S = (typeof SpiisStore !== 'undefined') ? SpiisStore : null;
      const d = S && S.getDagensRetList(S.todayISO()).find((x) => x.title === dish);
      if (d && d.stock != null && d.stock !== '') total = Number(d.stock) || null;
    } catch { /* no numbers, no bar */ }
    // portions left are only mentioned when they are few – no countdown
    set('.nl-stock', soldout ? 'Udsolgt i dag' : (left && Number(left) <= 5 ? `Kun ${left} portion${Number(left) === 1 ? '' : 'er'} tilbage i dag` : ''));
    const bar = $('.nl-bar');
    if (bar) {
      const show = false && total;
      bar.hidden = !show;
      if (show) bar.firstElementChild.style.transform = `scaleX(${Math.max(0, Math.min(1, Number(left) / total)).toFixed(3)})`;
    }
    // the kitchen's own photo of the dish, when there is one
    const fImg = $('#todayFotoImg'), fBox = $('#todayFoto'), nf = $('.nl-foto');
    if (nf) {
      const src = fBox && !fBox.hidden && fImg && fImg.getAttribute('src');
      nf.hidden = !src;
      if (src && nf.firstElementChild.getAttribute('src') !== src) { nf.firstElementChild.src = src; nf.firstElementChild.alt = dish; }
    }
    const cut = txt('#orderCutoff') || s.rest || '';
    set('.nl-cut', cut.replace(/^[🕐🕑🕒⏰\s]+/u, ''));
    // the dock
    set('.nd-state', s.on === null ? 'Spiis' : (s.on ? 'Åbent nu' : 'Lukket nu'));
    set('.nd-dish', dish && !/indlæser/i.test(dish) ? dish : '');
    set('.nd-stock', soldout ? 'Udsolgt' : (left ? `${left} tilbage` : ''));
    document.documentElement.classList.toggle('ny-open', s.on === true);
    document.documentElement.classList.toggle('ny-soldout', soldout);
    // today in the week ahead
    $$('.dayplan').forEach((d) => d.classList.toggle('ny-today', /i dag/i.test(d.querySelector('.dayplan__day')?.textContent || '')));
  }

  // the date in words, and the rest of the week from the kitchen's plan
  const S = (typeof SpiisStore !== 'undefined') ? SpiisStore : null;
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function week() {
    const d = new Date();
    set('.nh-date', d.toLocaleDateString('da-DK', { weekday: 'long' }) + ' ' + d.toLocaleDateString('da-DK', { day: 'numeric', month: 'long' }));
    const ol = $('#nhWeek'); if (!ol || !S) return;
    let rows = [];
    try {
      // the next days the kitchen is open, up to four of them
      // the next days with a dish planned, up to four; none planned, no card
      rows = S.getPlan(10).slice(1).filter((day) => day.open && (day.dishes || []).length && !(S.isOrderingClosed && S.isOrderingClosed(day.iso))).slice(0, 4).map((day) => {
        const dishes = day.dishes || [];
        const name = dishes.length ? dishes.map((x) => x.title).join(' · ') : 'Menuen kommer snart';
        const price = dishes.length === 1 && dishes[0].price ? `${dishes[0].price} kr.` : '';
        return `<li class="${dishes.length ? '' : 'is-soon'}"><b>${esc(day.weekday.slice(0, 3))}</b><span>${esc(name)}</span><em>${esc(price)}</em></li>`;
      });
    } catch { rows = []; }
    const h = rows.join('');
    if (ol.innerHTML !== h) ol.innerHTML = h;
    ol.closest('.nh-week').hidden = !rows.length;
  }
  week();
  if (S && S.subscribe) S.subscribe(week);

  function clock() {
    const n = new Date();
    set('.nl-time', `${String(n.getHours()).padStart(2, '0')}.${String(n.getMinutes()).padStart(2, '0')}`);
  }

  let raf = 0;
  const ask = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); };
  ['#todayDish', '#todayStock', '#todayPrice', '#openStatus', '#orderCutoff', '#weekPlan', '#todayFoto'].forEach((s) => {
    const e = $(s); if (e) new MutationObserver(ask).observe(e, { childList: true, subtree: true, characterData: true, attributes: true });
  });
  paint(); clock(); setInterval(clock, 20000);

  // the dock comes in once the opening is passed, and gives way at the order form
  const hero = $('.hero');
  let pastHero = false; const atForm = new Set();
  const dock = () => document.documentElement.classList.toggle('ny-dock-on', pastHero && !atForm.size);
  if (hero) new IntersectionObserver(([e]) => { pastHero = !e.isIntersecting; dock(); }).observe(hero);
  // it gives way at the two order forms
  ['#orderForm', '#tapasForm'].forEach((s) => { const f = $(s); if (f) new IntersectionObserver(([e]) => { e.isIntersecting ? atForm.add(s) : atForm.delete(s); dock(); }, { rootMargin: '-20% 0px -20% 0px' }).observe(f); });
  // and at the footer, so it never sits over the links there
  const foot = $('.footer'); if (foot) new IntersectionObserver(([e]) => { e.isIntersecting ? atForm.add('footer') : atForm.delete('footer'); dock(); }).observe(foot);
})();
