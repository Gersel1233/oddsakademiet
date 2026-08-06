/* Menukortet på sin EGEN side (menu.html) – dagens retter pr. ugedag og
   det faste sortiment. Kører direkte på den fælles Spiis-database og
   opdaterer sig selv, hvis køkkenet retter menuen imens. */
(() => {
  const S = SpiisStore;
  const $ = (sel, root = document) => root.querySelector(sel);
  const kr = (n) => `${n} kr.`;
  const esc = (str) => String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* beskrivelser kan skrives i PUNKTFORM: hver linje bliver sit eget punkt */
  function descHtml(desc) {
    const lines = String(desc || '').split('\n').map((l) => l.replace(/^[-•·*]\s*/, '').trim()).filter(Boolean);
    if (lines.length <= 1) return esc(desc || '');
    return `<ul class="descpoints">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
  }

  let activeDay = S.weekdayIndex(S.todayISO());

  function renderDayTabs() {
    const tabs = $('#dayTabs');
    tabs.innerHTML = S.WEEKDAYS.map((day, i) =>
      `<button class="daytab ${i === activeDay ? 'is-active' : ''}" role="tab" aria-selected="${i === activeDay}" data-day="${i}">${day}</button>`
    ).join('');
    /* på mobil ruller fanerne vandret – centrér den aktive */
    const active = tabs.querySelector('.is-active');
    if (active && tabs.scrollWidth > tabs.clientWidth) {
      tabs.scrollLeft = active.offsetLeft - (tabs.clientWidth - active.offsetWidth) / 2;
    }
  }

  /* find næste dato der matcher ugedagen (0=mandag) */
  function nextDateForWeekday(dayIdx) {
    let iso = S.todayISO();
    for (let i = 0; i < 7; i++) {
      if (S.weekdayIndex(iso) === dayIdx) return iso;
      iso = S.addDays(iso, 1);
    }
    return iso;
  }

  function renderDayMenu() {
    const el = $('#dayMenu');
    const iso = nextDateForWeekday(activeDay);
    const hours = S.getHours()[activeDay];
    const extras = S.getMenu().weekly[activeDay] || [];

    let rows = '';
    if (hours.closed) {
      rows = `<p class="daymenu__empty">Vi holder lukket om ${S.WEEKDAYS[activeDay].toLowerCase()}en – vi ses en anden dag! 👋</p>`;
    } else {
      const lines = [];
      /* ALLE dagens retter (der kan være flere) – med punktopstilling i beskrivelsen */
      S.getDagensRetList(iso).forEach((d) => {
        lines.push(`<div class="menuline">
          <div>
            <div class="menuline__name">${esc(d.title)}<span class="menuline__badge">Dagens ret</span></div>
            ${d.desc ? `<div class="menuline__desc">${descHtml(d.desc)}</div>` : ''}
          </div>
          <span class="menuline__price">${d.price ? kr(d.price) : ''}</span>
        </div>`);
      });
      extras.forEach((item) => {
        lines.push(`<div class="menuline">
          <div>
            <div class="menuline__name">${esc(item.name)}</div>
            ${item.desc ? `<div class="menuline__desc">${descHtml(item.desc)}</div>` : ''}
          </div>
          <span class="menuline__price">${item.price ? kr(item.price) : ''}</span>
        </div>`);
      });
      rows = lines.length
        ? lines.join('')
        : '<p class="daymenu__empty">Menuen for denne dag er på vej – kig forbi eller ring og hør nærmere.</p>';
    }

    el.innerHTML = `
      <div class="daymenu__head">
        <span class="daymenu__title">${S.WEEKDAYS[activeDay]}</span>
        <span class="daymenu__date">${esc(S.formatDate(iso, false))}${hours.closed ? '' : ` · ${hours.open}–${hours.close}`}</span>
      </div>
      ${rows}`;
    el.classList.remove('is-switching');
    void el.offsetWidth; /* genstart animationen */
    el.classList.add('is-switching');
  }

  $('#dayTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.daytab');
    if (!btn) return;
    activeDay = Number(btn.dataset.day);
    renderDayTabs();
    renderDayMenu();
  });

  /* lille ikon pr. kategori – kendes på id/navn, ellers en tallerken */
  function catIcon(cat) {
    const key = `${cat.id || ''} ${cat.name || ''}`.toLowerCase();
    if (/salat/.test(key)) return '🥗';
    if (/friture|pommes|frit/.test(key)) return '🍟';
    if (/drik/.test(key)) return '🥤';
    if (/ret/.test(key)) return '🍔';
    if (/andet|brød|panini/.test(key)) return '🥖';
    return '🍽️';
  }

  function renderCategories() {
    const wrap = $('#menuCategories');
    const cats = S.getMenu().categories;
    wrap.innerHTML = cats.map((cat, i) => {
      /* sidste kategori får fuld bredde med varerne i spalter,
         så den ikke står alene i en smal kolonne */
      const wide = cats.length >= 3 && i === cats.length - 1;
      return `
      <div class="card menucat ${wide ? 'menucat--wide' : ''} is-visible" data-reveal>
        <h4><span class="menucat__icon" aria-hidden="true">${catIcon(cat)}</span>${esc(cat.name)}${cat.availability === 'hverdage' ? '<span class="menucat__badge">Kun hverdage</span>' : ''}</h4>
        <div class="menucat__items">
        ${cat.items.map((item) => `
          <div class="menuline ${item.soldout ? 'menuline--soldout' : ''}">
            <div>
              <div class="menuline__name">${esc(item.name)}${item.soldout ? '<span class="menuline__badge menuline__badge--out">Udsolgt i dag</span>' : (item.left ? `<span class="menuline__badge menuline__badge--few">Kun ${esc(item.left)} tilbage</span>` : '')}</div>
              ${item.desc ? `<div class="menuline__desc">${descHtml(item.desc)}</div>` : ''}
            </div>
            <span class="menuline__price">${item.price ? kr(item.price) : ''}</span>
          </div>`).join('')}
        </div>
      </div>`;
    }).join('');

    /* note om weekend-udvalget, hvis nogle kategorier kun er hverdage */
    const note = $('#menucatsNote');
    if (note) {
      const weekendCats = cats.filter((c) => c.availability !== 'hverdage').map((c) => c.name);
      note.textContent = cats.some((c) => c.availability === 'hverdage') && weekendCats.length
        ? `I weekenden serverer vi: ${weekendCats.join(', ')}.`
        : '';
    }
  }

  /* på menu-siden vises alt med det samme – ingen fade-ind at vente på */
  document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-visible'));

  function renderAll() {
    renderDayTabs();
    renderDayMenu();
    renderCategories();
  }
  renderAll();
  S.subscribe(renderAll);
})();
