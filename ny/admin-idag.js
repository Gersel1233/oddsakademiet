/* Spiis admin /ny/: "I dag" at the top of Overblik. Today's dish on the
   same chalkboard as the website, how much is sold, until when guests can
   order, the next pickups – and a short list of the things worth knowing
   right now, each with a way straight to where it is fixed. It only reads;
   nothing here changes data. */
(() => {
  const S = (typeof SpiisStore !== 'undefined') ? SpiisStore : null;
  if (!S) return;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toMin = (t) => { const [h, m] = String(t || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}.${String(m % 60).padStart(2, '0')}`;
  const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const go = (view) => { const b = document.querySelector(`.navitem[data-view="${view}"]`); if (b) b.click(); scrollTo({ top: 0, behavior: 'smooth' }); };

  function build() {
    const iso = S.todayISO();
    const h = S.hoursFor(iso) || {};
    const closedDay = h.closed || (S.isOrderingClosed && S.isOrderingClosed(iso)) || (S.isClosureNow && S.isClosureNow());
    const dishes = S.getDagensRetList(iso);
    const d = new Date();
    const dateTxt = d.toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' });

    // the dish and how far the day has come
    let dishHtml;
    if (closedDay) dishHtml = '<p class="aid-dish">Lukket i dag</p>';
    else if (!dishes.length) dishHtml = '<p class="aid-dish aid-dish--none">Ingen dagens ret lagt ind</p><button type="button" class="aid-link" data-go="dagensret">Læg dagens ret ind →</button>';
    else dishHtml = dishes.map((x) => {
      const left = S.getRemainingFor(iso, x.title);
      const total = x.stock != null && x.stock !== '' ? Number(x.stock) : null;
      const sold = total != null && left != null ? Math.max(0, total - left) : (dishes.length === 1 ? S.getSold(iso) : S.getSoldFor(iso, x.title));
      const pct = total ? Math.min(1, sold / total) : 0;
      return `<div class="aid-ret">
        <p class="aid-dish">${esc(x.title)}${x.price ? `<span>${esc(x.price)} kr.</span>` : ''}</p>
        <p class="aid-sold">${x.soldout || left === 0 ? '<b class="aid-out">Udsolgt</b>' : `<b>${sold}</b> solgt${total ? ` af ${total}` : ''}${left != null ? ` · ${left} tilbage` : ''}`}</p>
        ${total ? `<div class="aid-bar"><i style="transform:scaleX(${pct.toFixed(3)})"></i></div>` : ''}
      </div>`;
    }).join('');

    // until when guests can order today – the same sums as the website
    const frist = (type) => {
      if (closedDay || (S.isTypeClosed && S.isTypeClosed(iso, type))) return null;
      const slots = S.orderSlots(iso, 30, type); const last = slots[slots.length - 1];
      return last ? toMin(last) - 20 : null;
    };
    const tg = frist('togo'), sp = frist('spise');
    const timesHtml = closedDay ? '' : `<p class="aid-times">${h.open && h.close ? `Åbent ${esc(h.open.replace(':', '.'))}–${esc(h.close.replace(':', '.'))}` : ''}${tg != null ? ` · To-go til ${fmt(tg)}` : ''}${sp != null ? ` · Spis her til ${fmt(sp)}` : ''}</p>`;

    // the next pickups today
    const orders = S.getOrders(iso).filter((o) => o.status !== 'afvist' && o.status !== 'slettet');
    const n = nowMin();
    const next = orders.filter((o) => o.status === 'ny' && toMin(o.time) >= n - 15).slice(0, 4);
    const lines = (o) => (o.items || []).filter((l) => l && l.qty).map((l) => `${l.qty} × ${l.name}${l.valg ? ` (${l.valg})` : ''}`).join(', ') || (o.qty ? `${o.qty} × ${o.dish || 'dagens ret'}` : '');
    const nextHtml = next.length ? next.map((o) => `<button type="button" class="aid-next" data-go="bestillinger">
        <span class="aid-next__t">${esc(String(o.time || '').replace(':', '.'))}</span>
        <span class="aid-next__n">${esc(o.name || 'Uden navn')}<small>${esc(lines(o))}</small></span>
        <span class="aid-next__k">${o.type === 'togo' ? 'To-go' : 'Spis her'}</span></button>`).join('')
      : `<p class="aid-empty">${orders.length ? 'Alle dagens bestillinger er kørt ✓' : 'Ingen bestillinger til i dag endnu'}</p>`;

    // the things worth knowing right now
    const tips = [];
    const ny = orders.filter((o) => o.status === 'ny').length;
    if (ny) tips.push(['now', `${ny} bestilling${ny === 1 ? '' : 'er'} i dag mangler at blive kørt`, 'bestillinger', 'Se bestillinger']);
    const waiting = S.getBookings().filter((b) => b.status === 'ny').length;
    if (waiting) tips.push(['now', `${waiting} booking${waiting === 1 ? '' : 'er'} venter på svar`, 'bookinger', 'Svar nu']);
    dishes.forEach((x) => { const left = S.getRemainingFor(iso, x.title); if (left != null && left > 0 && left <= 5) tips.push(['warn', `Kun ${left} ${x.title} tilbage – sæt flere portioner på, hvis I har dem`, 'dagensret', 'Ret antal']); });
    if (!closedDay && h.close) {
      const dineTo = toMin(S.orderToFor('spise', iso)), close = toMin(h.close);
      if (dineTo > close) tips.push(['info', `"Spis her" stopper kl. ${fmt((sp ?? close - 20))} i dag, fordi køkkenet lukker ${h.close.replace(':', '.')} – ret lukketiden, hvis gæsterne skal kunne spise senere`, 'tider', 'Åbningstider']);
    }
    const missing = S.getPlan(8).slice(1).filter((day) => day.open && !(S.isOrderingClosed && S.isOrderingClosed(day.iso)) && !(day.dishes || []).length).map((day) => day.weekday.toLowerCase());
    if (missing.length) tips.push(['warn', `Ingen dagens ret lagt ind for ${missing.length > 3 ? `${missing.slice(0, 3).join(', ')} og ${missing.length - 3} dage mere` : missing.join(', ').replace(/, ([^,]*)$/, ' og $1')}`, 'dagensret', 'Planlæg ugen']);
    const st = S.getSettings();
    if (st.tapasMode === 'pause') tips.push(['info', 'Tapas holder pause på den nye hjemmeside', 'indstillinger', 'Skift']);
    if (st.tapasMode === 'off') tips.push(['info', 'Tapas er skjult på den nye hjemmeside', 'indstillinger', 'Skift']);
    if (st.ordersPaused) tips.push(['warn', 'Bestillinger på hjemmesiden er sat på pause', 'tider', 'Slå til igen']);
    (S.getNews() || []).forEach((nw) => { if (nw.orderable && nw.orderBy && nw.orderBy < iso && S.newsVisibleNow && S.newsVisibleNow(nw)) tips.push(['info', `Nyheden "${nw.title}" vises stadig, men fristen er udløbet`, 'nyheder', 'Ret nyhed']); });
    const tipsHtml = tips.length ? tips.map(([k, t, v, b]) => `<li class="aid-tip aid-tip--${k}"><i></i><span>${esc(t)}</span><button type="button" data-go="${v}">${esc(b)} →</button></li>`).join('')
      : '<li class="aid-tip aid-tip--ok"><i></i><span>Alt ser godt ud – intet der venter på jer lige nu</span></li>';

    const el = document.createElement('section');
    el.className = 'aid';
    el.innerHTML = `
      <div class="aid-board">
        <p class="aid-k">I dag · ${esc(dateTxt)}</p>
        ${dishHtml}
        ${timesHtml}
      </div>
      <div class="aid-side">
        <div class="aid-box">
          <h3>Det skal I vide</h3>
          <ul class="aid-tips">${tipsHtml}</ul>
        </div>
        <div class="aid-box">
          <h3>Næste afhentninger</h3>
          <div class="aid-nexts">${nextHtml}</div>
        </div>
      </div>`;
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) go(b.dataset.go); });
    return el;
  }

  let sig = '';
  function place(force) {
    const v = document.getElementById('view-overblik'); if (!v || !v.firstElementChild) return;
    const fresh = build();
    const now = fresh.innerHTML;
    const old = v.querySelector(':scope > .aid');
    if (old && !force && now === sig) return;
    sig = now;
    if (old) old.replaceWith(fresh); else v.prepend(fresh);
  }
  const v = document.getElementById('view-overblik');
  if (v) new MutationObserver(() => { if (!v.querySelector(':scope > .aid')) place(true); }).observe(v, { childList: true });
  place(true);
  if (S.subscribe) S.subscribe(() => place(false));
  setInterval(() => place(false), 60000);
})();
