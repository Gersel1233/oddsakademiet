/* Spiis /ny/: every dish on the menu leads straight to that dish in the
   order. On the front page a tap scrolls to the order form, opens the
   dish's category and lights the dish up. On the menu page a tap goes to
   the front page with the dish in the address, and the same happens there.
   It only scrolls and opens; nothing is added to the basket by itself. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const own = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
  const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- the front page: the order is here ----------
  const builder = $('#builder');
  if (builder) {
    let noteTimer;
    const note = (text) => {
      let n = $('.ny-goto-note'); clearTimeout(noteTimer);
      if (!text) { if (n) n.remove(); return; }
      if (!n) { n = document.createElement('p'); n.className = 'ny-goto-note'; n.setAttribute('role', 'status'); builder.before(n); }
      n.textContent = text; noteTimer = setTimeout(() => n.remove(), 9000);
    };
    // the order re-draws itself when the menu or the basket changes, so the
    // dish is found again and kept lit until the moment has passed
    let lit = null;
    const find = (ret, kat) => {
      if (kat === 'dagens') return $('.builder__dagens', builder);
      const cat = [...builder.querySelectorAll('details.bcat')].find((d) => same(d.dataset.cat, kat));
      if (!cat) return null;
      if (!cat.open) cat.open = true;
      return [...cat.querySelectorAll('.bitem')].find((b) => { const s = $('.bitem__info strong', b); return s && same(own(s), ret); }) || cat;
    };
    new MutationObserver(() => {
      if (!lit || Date.now() > lit.until) return;
      const t = find(lit.ret, lit.kat); if (t && !t.classList.contains('ny-hit')) t.classList.add('ny-hit');
    }).observe(builder, { childList: true });
    const go = (ret, kat) => {
      let target = null; note('');
      target = find(ret, kat);
      if (!target && kat && kat !== 'dagens') {
        note(`${kat} kan ikke bestilles den dag, der er valgt. Vælg en anden dag øverst, så kommer ${kat.toLowerCase()} frem.`);
      }
      const el = target || $('.ny-goto-note') || $('#orderForm') || $('#bestil');
      if (!el) return;
      el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' });
      if (!target) return;
      lit = { ret, kat, until: Date.now() + 2600 };
      target.classList.add('ny-hit');
      setTimeout(() => { lit = null; builder.querySelectorAll('.ny-hit').forEach((h) => h.classList.remove('ny-hit')); }, 2700);
    };
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a.nm-item[data-ret]'); if (!a) return;
      e.preventDefault(); go(a.dataset.ret, a.dataset.kat);
    });
    // arriving from the menu page with a dish in the address
    const q = new URLSearchParams(location.search), ret = q.get('ret'), kat = q.get('kat');
    if (ret || kat) {
      // the order first draws from what the browser has, then again when
      // Spiis' menu has arrived; go as soon as the dish is there
      let done = false;
      const tryGo = (force) => {
        if (done) return;
        if (!force && !find(ret, kat)) return;
        done = true; mo.disconnect(); history.replaceState(null, '', location.pathname + '#bestil');
        setTimeout(() => go(ret, kat), 60);
      };
      const mo = new MutationObserver(() => tryGo(false)); mo.observe(builder, { childList: true });
      tryGo(false); setTimeout(() => tryGo(true), 6000);
    }
    return;
  }

  // ---------- the menu page: each row leads to the order ----------
  const cats = $('#menuCategories'), day = $('#dayMenu');
  if (!cats && !day) return;
  const tag = (l, ret, kat) => {
    if (l.dataset.ret) return;
    l.dataset.ret = ret; l.dataset.kat = kat;
    const out = l.classList.contains('menuline--soldout') || !!$('.menuline__badge--out', l);
    if (out) { l.classList.add('menuline--soldout'); return; }
    l.tabIndex = 0; l.setAttribute('role', 'link'); l.setAttribute('aria-label', `Bestil ${ret}`);
  };
  const mark = () => {
    if (cats) cats.querySelectorAll('.menucat').forEach((c) => {
      const h = $('h4', c), k = h ? own(h) : '';
      c.querySelectorAll('.menuline').forEach((l) => { const n = $('.menuline__name', l); if (n) tag(l, own(n), k); });
    });
    if (day) day.querySelectorAll('.menuline').forEach((l) => { const n = $('.menuline__name', l); if (n) tag(l, own(n), 'dagens'); });
  };
  mark();
  [cats, day].forEach((el) => el && new MutationObserver(mark).observe(el, { childList: true, subtree: true }));
  const open = (l) => {
    if (l.classList.contains('menuline--soldout')) return;
    location.href = `./?ret=${encodeURIComponent(l.dataset.ret)}&kat=${encodeURIComponent(l.dataset.kat)}#bestil`;
  };
  document.addEventListener('click', (e) => { const l = e.target.closest('.menuline[data-ret]'); if (l) open(l); });
  document.addEventListener('keydown', (e) => { if (e.key !== 'Enter' || !e.target.closest) return; const l = e.target.closest('.menuline[data-ret]'); if (l) open(l); });
})();
