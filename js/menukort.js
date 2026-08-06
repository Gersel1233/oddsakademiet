/* Menukortet på sin EGEN side (menu.html) – så enkelt som muligt:
   dagens ret øverst, derefter det faste menukort. Kører direkte på den
   fælles Spiis-database og opdaterer sig selv, hvis køkkenet retter noget. */
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

  /* dagens ret – kun i dag, kort og klart */
  function renderToday() {
    const el = $('#dayMenu');
    const iso = S.todayISO();
    const hours = S.getHours()[S.weekdayIndex(iso)];
    const dishes = S.getDagensRetList(iso);

    let rows = '';
    if (hours.closed) {
      rows = '<p class="daymenu__empty">Vi holder lukket i dag – vi ses en anden dag! 👋</p>';
    } else if (!dishes.length) {
      rows = '<p class="daymenu__empty">Dagens ret følger snart – kig forbi eller se forsiden.</p>';
    } else {
      rows = dishes.map((d) => {
        const rem = S.getRemainingFor(iso, d.title);
        const tag = rem !== null && rem <= 0
          ? '<span class="menuline__badge menuline__badge--out">Udsolgt i dag</span>'
          : (rem !== null && rem <= 5 ? `<span class="menuline__badge menuline__badge--few">Kun ${rem} tilbage</span>` : '');
        return `<div class="menuline">
          <div>
            <div class="menuline__name">${esc(d.title)}<span class="menuline__badge">Dagens ret</span>${tag}</div>
            ${d.desc ? `<div class="menuline__desc">${descHtml(d.desc)}</div>` : ''}
          </div>
          <span class="menuline__price">${d.price ? kr(d.price) : ''}</span>
        </div>`;
      }).join('');
    }

    el.innerHTML = `
      <div class="daymenu__head">
        <span class="daymenu__title">I dag</span>
        <span class="daymenu__date">${esc(S.formatDate(iso, false))}${hours.closed ? '' : ` · ${hours.open}–${hours.close}`}</span>
      </div>
      ${rows}`;
  }

  /* lille ikon pr. kategori – kendes på id/navn, ellers en tallerken */
  function catIcon(cat) {
    const key = `${cat.id || ''} ${cat.name || ''}`.toLowerCase();
    if (/burger/.test(key)) return '🍔';
    if (/salat/.test(key)) return '🥗';
    if (/friture|pommes|frit/.test(key)) return '🍟';
    if (/drik/.test(key)) return '🥤';
    if (/nacho|bowl/.test(key)) return '🌮';
    if (/ret/.test(key)) return '🍽️';
    if (/andet|brød|panini|sandwich/.test(key)) return '🥖';
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
    renderToday();
    renderCategories();
  }
  renderAll();
  S.subscribe(renderAll);
})();
