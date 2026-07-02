/* ============================================================
   Spiis – egen datovælger
   Erstatter browserens native datofelt med en kalender i Spiis'
   design. Det oprindelige input beholdes skjult med ISO-værdi og
   får almindelige 'change'-events, så al eksisterende logik
   fungerer uændret. Kræver SpiisStore (indlæses efter store.js).

   SpiisDatepicker.attach(input, {
     min:    'YYYY-MM-DD' | null   – tidligste valgbare dato
     state:  (iso) => 'ok' | 'closed' | 'blocked'  – dagens tilstand
     marker: (iso) => bool          – lille prik på dagen (fx ordrer)
     legend: bool                   – vis forklaring under kalenderen
   });
   ============================================================ */

const SpiisDatepicker = (() => {
  const S = SpiisStore;
  let openInstance = null;

  const WEEKDAYS_SHORT = ['ma', 'ti', 'on', 'to', 'fr', 'lø', 'sø'];

  function monthLabel(year, month) {
    const name = S.MONTHS[month];
    return name.charAt(0).toUpperCase() + name.slice(1) + ' ' + year;
  }

  function buttonLabel(iso) {
    return iso ? S.formatDate(iso) : 'Vælg dato';
  }

  function attach(input, opts = {}) {
    if (input._spiisDp) { input._spiisDp.sync(); return input._spiisDp; }

    /* skjul det native felt, indsæt knap + kalender-holder */
    const wrap = document.createElement('div');
    wrap.className = 'dp-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    input.classList.add('dp-input-hidden');
    input.setAttribute('tabindex', '-1');
    input.setAttribute('aria-hidden', 'true');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dp-btn';
    wrap.appendChild(btn);

    const pop = document.createElement('div');
    pop.className = 'dp-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Vælg dato');
    pop.hidden = true;
    wrap.appendChild(pop);

    let view = null; /* { year, month } for den viste måned */

    function currentIso() {
      return /^\d{4}-\d{2}-\d{2}$/.test(input.value) ? input.value : '';
    }

    function sync() {
      const iso = currentIso();
      btn.innerHTML = `<span class="dp-btn__icon" aria-hidden="true">📅</span><span>${buttonLabel(iso)}</span>`;
      btn.classList.toggle('dp-btn--empty', !iso);
    }

    function stateFor(iso) {
      if (opts.min && iso < opts.min) return 'disabled';
      return opts.state ? (opts.state(iso) || 'ok') : 'ok';
    }

    function render() {
      const selected = currentIso();
      const today = S.todayISO();
      const { year, month } = view;

      const firstIdx = (new Date(year, month, 1).getDay() + 6) % 7;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const cells = [];
      for (let i = 0; i < firstIdx; i++) cells.push('');
      for (let d = 1; d <= daysInMonth; d++) {
        cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      }
      while (cells.length % 7) cells.push('');

      pop.innerHTML = `
        <div class="dp-head">
          <button type="button" class="dp-nav" data-nav="-1" aria-label="Forrige måned">‹</button>
          <strong>${monthLabel(year, month)}</strong>
          <button type="button" class="dp-nav" data-nav="1" aria-label="Næste måned">›</button>
        </div>
        <div class="dp-grid">
          ${WEEKDAYS_SHORT.map((w) => `<span class="dp-wd">${w}</span>`).join('')}
          ${cells.map((iso) => {
            if (!iso) return '<span class="dp-day dp-day--out"></span>';
            const st = stateFor(iso);
            const disabled = st !== 'ok';
            const cls = [
              'dp-day',
              st === 'closed' ? 'dp-day--closed' : '',
              st === 'blocked' ? 'dp-day--blocked' : '',
              st === 'disabled' ? 'dp-day--muted' : '',
              iso === today ? 'dp-day--today' : '',
              iso === selected ? 'dp-day--selected' : '',
              opts.marker && opts.marker(iso) ? 'dp-day--dot' : '',
            ].filter(Boolean).join(' ');
            return `<button type="button" class="${cls}" data-iso="${iso}" ${disabled ? 'disabled' : ''}>${Number(iso.slice(8))}</button>`;
          }).join('')}
        </div>
        ${opts.legend ? `
        <div class="dp-legend">
          <span><i class="dp-leg dp-leg--ok"></i>Ledig</span>
          <span><i class="dp-leg dp-leg--blocked"></i>Optaget</span>
          <span><i class="dp-leg dp-leg--closed"></i>Lukket</span>
        </div>` : ''}
        <div class="dp-foot">
          <button type="button" class="dp-link" data-today>I dag</button>
          <button type="button" class="dp-link" data-close>Luk</button>
        </div>`;
    }

    function open() {
      if (openInstance && openInstance !== api) openInstance.close();
      const iso = currentIso() || S.todayISO();
      view = { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) - 1 };
      render();
      pop.hidden = false;
      /* hold kalenderen inden for skærmen */
      pop.classList.remove('dp-pop--right');
      const rect = pop.getBoundingClientRect();
      if (rect.right > window.innerWidth - 8) pop.classList.add('dp-pop--right');
      openInstance = api;
    }

    function close() {
      pop.hidden = true;
      if (openInstance === api) openInstance = null;
    }

    function pick(iso) {
      input.value = iso;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      sync();
      close();
    }

    btn.addEventListener('click', () => (pop.hidden ? open() : close()));

    pop.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav]');
      if (nav) {
        view.month += Number(nav.dataset.nav);
        if (view.month < 0) { view.month = 11; view.year--; }
        if (view.month > 11) { view.month = 0; view.year++; }
        render();
        return;
      }
      if (e.target.closest('[data-today]')) {
        const today = S.todayISO();
        if (stateFor(today) === 'ok') { pick(today); return; }
        view = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 };
        render();
        return;
      }
      if (e.target.closest('[data-close]')) { close(); return; }
      const day = e.target.closest('.dp-day[data-iso]');
      if (day && !day.disabled) pick(day.dataset.iso);
    });

    /* luk ved klik udenfor og på Escape */
    document.addEventListener('click', (e) => {
      if (!pop.hidden && !wrap.contains(e.target)) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });

    /* hold knappen synkron når værdien ændres udefra (fx form.reset) */
    input.addEventListener('change', sync);
    const form = input.closest('form');
    if (form) form.addEventListener('reset', () => setTimeout(sync));

    sync();
    const api = { sync, open, close };
    input._spiisDp = api;
    return api;
  }

  return { attach };
})();
