/* Spiis admin /ny/: "Det viser hjemmesiden". The kitchen decides here what
   the site shows, starting with tapas: open for orders, a pause (shown,
   but not orderable, with an optional message), or hidden. It is saved in
   Spiis' own settings, so it reaches the site at once. Nothing else in the
   admin changes. */
(() => {
  const S = (typeof SpiisStore !== 'undefined') ? SpiisStore : null;
  if (!S) return;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MODES = {
    on: { now: 'Tapas kan bestilles', cls: 'is-on', said: 'Tapas kan bestilles på hjemmesiden' },
    pause: { now: 'Tapas holder pause', cls: 'is-pause', said: 'Tapas holder pause – den vises, men kan ikke bestilles' },
    off: { now: 'Tapas er skjult', cls: 'is-off', said: 'Tapas er skjult på hjemmesiden' },
  };
  const mode = () => (MODES[S.getSettings().tapasMode] ? S.getSettings().tapasMode : 'on');

  let toastTimer;
  const toast = (msg) => {
    const el = $('#toast'); if (!el) return;
    el.textContent = msg; el.classList.remove('toast--fortryd', 'toast--fejl'); el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  };

  // tapas orders already placed for today or later: they still have to be made
  const ahead = () => {
    const today = S.todayISO();
    return (S.getOrders() || []).filter((o) => o && o.date >= today && (o.items || []).some((l) => l && l.kind === 'tapas')).length;
  };

  function card() {
    const m = mode(), M = MODES[m], n = ahead();
    const el = document.createElement('div');
    el.className = 'acard ny-site';
    el.innerHTML = `
      <div class="ny-site__top">
        <div class="acard__head" style="margin:0"><h2>🌐 Det viser hjemmesiden</h2></div>
        <span class="ny-site__now ${M.cls}"><i></i>${M.now}</span>
      </div>
      <p class="sub" style="margin-top:6px;color:var(--ink-soft)">Slå dele af hjemmesiden til og fra. Det slår igennem med det samme – også for gæster, der har siden åben.</p>
      <div class="ny-site__item">
        <h3>🧀 Spiis Tapas</h3>
        <p>Laver I ikke tapas i en periode, så hold pause eller skjul den. Priser, indhold og billede bliver liggende til næste gang.</p>
        <div class="ny-seg" role="group" aria-label="Tapas på hjemmesiden">
          <button type="button" data-v="on" aria-pressed="${m === 'on'}">Kan bestilles<small>Vises og kan bestilles</small></button>
          <button type="button" data-v="pause" aria-pressed="${m === 'pause'}">Pause<small>Vises, men kan ikke bestilles</small></button>
          <button type="button" data-v="off" aria-pressed="${m === 'off'}">Skjult<small>Væk fra hjemmesiden</small></button>
        </div>
        <label class="afield ny-site__msg" ${m === 'pause' ? '' : 'hidden'}><span>Besked til gæsterne under pausen (valgfri)</span>
          <input id="nyTapasMsg" maxlength="160" placeholder="Fx: Tapas er tilbage i november – ring, hvis I har et særligt ønske." value="${esc(S.getSettings().tapasPauseMsg || '')}" /></label>
        ${n && m !== 'on' ? `<p class="ny-site__note">📋 Der ligger ${n} tapasbestilling${n === 1 ? '' : 'er'} til i dag eller senere. ${n === 1 ? 'Den' : 'De'} gælder stadig og skal laves som aftalt.</p>` : ''}
      </div>
      <p class="ny-site__note">Gælder den nye hjemmeside (spiis.dk/ny). Den nuværende forside viser tapas som før, indtil den nye går i luften.</p>`;
    el.querySelectorAll('.ny-seg button').forEach((b) => b.addEventListener('click', () => {
      const v = b.dataset.v; if (v === mode()) return;
      const viewId = (el.closest('.view') || {}).id || 'view-indstillinger';
      S.updateSettings({ tapasMode: v });
      toast('✓ ' + MODES[v].said);
      redraw(true);
      const again = document.querySelector(`#${viewId} .ny-seg button[data-v="${v}"]`);
      if (again) again.focus({ preventScroll: true });
    }));
    const msg = $('#nyTapasMsg', el); let t;
    if (msg) msg.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { S.updateSettings({ tapasPauseMsg: msg.value.trim() }); toast('✓ Beskeden er gemt'); }, 700); });
    return el;
  }

  // put the card at the top of Indstillinger and Menukort, and again whenever
  // the admin draws those views anew; never while someone is typing in it
  const place = (view, force) => {
    const v = document.getElementById(view); if (!v || !v.firstElementChild) return;
    const old = $('.ny-site', v);
    if (old && !force && old.contains(document.activeElement)) return;
    const fresh = card();
    if (old) old.replaceWith(fresh); else v.prepend(fresh);
  };
  ['view-indstillinger', 'view-menukort'].forEach((id) => {
    const v = document.getElementById(id); if (!v) return;
    new MutationObserver(() => { if (!$('.ny-site', v)) place(id); }).observe(v, { childList: true });
    place(id);
  });
  function redraw(force) {
    last = JSON.stringify([mode(), S.getSettings().tapasPauseMsg || '', ahead()]);
    place('view-indstillinger', force); place('view-menukort', force);
  }
  // when the setting changes (here or on another phone), redraw the card
  let last = JSON.stringify([mode(), S.getSettings().tapasPauseMsg || '', ahead()]);
  S.subscribe(() => {
    const now = JSON.stringify([mode(), S.getSettings().tapasPauseMsg || '', ahead()]);
    if (now === last) return; last = now;
    redraw(false);
  });
})();
