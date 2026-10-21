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
    set('.nl-price', txt('#todayPrice'));
    set('.nl-stock', soldout ? 'Udsolgt i dag' : (left ? `${left} portioner tilbage` : stock));
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

  function clock() {
    const n = new Date();
    set('.nl-time', `${String(n.getHours()).padStart(2, '0')}.${String(n.getMinutes()).padStart(2, '0')}`);
  }

  let raf = 0;
  const ask = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); };
  ['#todayDish', '#todayStock', '#todayPrice', '#openStatus', '#orderCutoff', '#weekPlan'].forEach((s) => {
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
