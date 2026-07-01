/* ============================================================
   Spiis – admin-dashboard: login, views og redigering
   ============================================================ */

(() => {
  const S = SpiisStore;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const kr = (n) => `${n} kr.`;
  const esc = (str) => String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  /* ---------- toast ---------- */
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  /* ---------- login ---------- */
  const AUTH_KEY = 'spiis-admin-auth';
  const loginScreen = $('#loginScreen');
  const app = $('#app');

  function isAuthed() {
    return sessionStorage.getItem(AUTH_KEY) === '1';
  }
  function showApp() {
    loginScreen.hidden = true;
    app.hidden = false;
    renderAll();
  }
  $('#loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const pin = $('#loginPin').value.trim();
    if (pin === S.getSettings().pin) {
      sessionStorage.setItem(AUTH_KEY, '1');
      $('#loginError').hidden = true;
      showApp();
    } else {
      $('#loginError').hidden = false;
      $('#loginPin').value = '';
      $('#loginPin').focus();
    }
  });
  $('#logoutBtn').addEventListener('click', () => {
    sessionStorage.removeItem(AUTH_KEY);
    location.reload();
  });

  /* ---------- topbar ---------- */
  function renderTopbarDate() {
    const iso = S.todayISO();
    $('#topbarDate').textContent = `${S.formatDate(iso)} ${new Date().getFullYear()}`;
  }

  /* ---------- notifikationer ---------- */
  const bellDrop = $('#bellDrop');

  function renderBell() {
    const unread = S.getUnread();
    const badge = $('#bellBadge');
    badge.hidden = unread.count === 0;
    badge.textContent = unread.count;

    const badgeOrders = $('#badgeOrders');
    badgeOrders.hidden = unread.orders.length === 0;
    badgeOrders.textContent = unread.orders.length;

    const badgeBookings = $('#badgeBookings');
    badgeBookings.hidden = unread.bookings.length === 0;
    badgeBookings.textContent = unread.bookings.length;

    const items = [
      ...unread.orders.map((o) => ({
        icon: '🥡',
        title: `Ny bestilling: ${o.qty} × ${o.dish}`,
        sub: `${o.name} · ${S.formatDate(o.date)} kl. ${o.time} · ${o.type === 'togo' ? 'To-go' : 'Spiser her'}`,
        at: o.createdAt,
      })),
      ...unread.bookings.map((b) => ({
        icon: b.kind === 'moede' ? '📅' : '🎉',
        title: `${b.kind === 'moede' ? 'Ny mødebooking' : 'Nyt arrangement'}: ${b.subject}`,
        sub: `${b.name} · ${S.formatDate(b.date)} kl. ${b.time}`,
        at: b.createdAt,
      })),
    ].sort((a, b) => (b.at || '').localeCompare(a.at || ''));

    $('#bellList').innerHTML = items.length
      ? items.map((n) => `
          <div class="notif notif--unread">
            <span class="notif__icon">${n.icon}</span>
            <div class="notif__text"><strong>${esc(n.title)}</strong><small>${esc(n.sub)}</small></div>
          </div>`).join('')
      : '<div class="belldrop__empty">Ingen nye notifikationer 🎉</div>';
  }

  $('#bellBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    bellDrop.hidden = !bellDrop.hidden;
  });
  document.addEventListener('click', (e) => {
    if (!bellDrop.hidden && !e.target.closest('.bell-wrap')) bellDrop.hidden = true;
  });
  $('#markReadBtn').addEventListener('click', () => {
    S.markAllRead();
    renderBell();
    renderListViews();
    toast('Alle notifikationer markeret som læst');
  });

  /* ---------- view-skift ---------- */
  const VIEW_TITLES = {
    overblik: 'Overblik',
    bestillinger: 'Bestillinger',
    bookinger: 'Bookinger',
    dagensret: 'Dagens ret',
    menukort: 'Menukort',
    tider: 'Åbningstider',
    indstillinger: 'Indstillinger',
  };
  let activeView = 'overblik';

  $('#sideNav').addEventListener('click', (e) => {
    const btn = e.target.closest('.navitem');
    if (!btn) return;
    activeView = btn.dataset.view;
    $$('.navitem').forEach((b) => b.classList.toggle('is-active', b === btn));
    $$('.view').forEach((v) => { v.hidden = v.id !== `view-${activeView}`; });
    $('#viewTitle').textContent = VIEW_TITLES[activeView];
    renderView(activeView);
  });

  function renderView(view) {
    const renderers = {
      overblik: renderOverblik,
      bestillinger: renderBestillinger,
      bookinger: renderBookinger,
      dagensret: renderDagensRetEditor,
      menukort: renderMenuEditor,
      tider: renderHoursEditor,
      indstillinger: renderSettings,
    };
    renderers[view]?.();
  }

  /* ============================================================
     OVERBLIK
     ============================================================ */
  function orderRow(o, showDate = false) {
    return `
      <div class="row ${o.status === 'ny' ? 'row--new' : ''}">
        <div class="row__main">
          <div class="row__title">${o.qty} × ${esc(o.dish)}
            <span class="tag ${o.type === 'togo' ? 'tag--accent' : 'tag--ink'}">${o.type === 'togo' ? '🥡 To-go' : '🍽️ Spiser her'}</span>
            ${o.status === 'ny' ? '<span class="tag tag--red">Ny</span>' : '<span class="tag tag--green">Håndteret</span>'}
          </div>
          <div class="row__sub">
            ${showDate ? `${esc(S.formatDate(o.date))} · ` : ''}kl. ${esc(o.time)} · ${esc(o.name)} · 📞 ${esc(o.phone)}
            ${o.note ? ` · 💬 ${esc(o.note)}` : ''}
          </div>
        </div>
        <div class="row__actions">
          ${o.status === 'ny'
            ? `<button class="abtn abtn--green" data-act="order-done" data-id="${o.id}">✓ Håndteret</button>`
            : `<button class="abtn abtn--ghost" data-act="order-undo" data-id="${o.id}">Fortryd</button>`}
          <button class="abtn abtn--danger abtn--icon" data-act="order-del" data-id="${o.id}" aria-label="Slet">🗑</button>
        </div>
      </div>`;
  }

  function bookingRow(b) {
    const statusTag = {
      ny: '<span class="tag tag--red">Ny</span>',
      bekraeftet: '<span class="tag tag--green">Bekræftet</span>',
      afvist: '<span class="tag">Afvist</span>',
    }[b.status] || '';
    return `
      <div class="row ${b.status === 'ny' ? 'row--new' : ''}">
        <div class="row__main">
          <div class="row__title">${b.kind === 'moede' ? '📅' : '🎉'} ${esc(b.subject)}
            <span class="tag ${b.kind === 'moede' ? 'tag--ink' : 'tag--accent'}">${b.kind === 'moede' ? 'Møde' : 'Arrangement'}</span>
            ${statusTag}
          </div>
          <div class="row__sub">
            ${esc(S.formatDate(b.date))} kl. ${esc(b.time)} · ${esc(b.name)} · 📞 ${esc(b.phone)}${b.email ? ` · ✉️ ${esc(b.email)}` : ''}
            ${b.desc ? `<br/>💬 ${esc(b.desc)}` : ''}
          </div>
        </div>
        <div class="row__actions">
          ${b.status !== 'bekraeftet' ? `<button class="abtn abtn--green" data-act="booking-ok" data-id="${b.id}">✓ Bekræft</button>` : ''}
          ${b.status !== 'afvist' ? `<button class="abtn abtn--ghost" data-act="booking-no" data-id="${b.id}">Afvis</button>` : ''}
          <button class="abtn abtn--danger abtn--icon" data-act="booking-del" data-id="${b.id}" aria-label="Slet">🗑</button>
        </div>
      </div>`;
  }

  function renderOverblik() {
    const today = S.todayISO();
    const orders = S.getOrders(today);
    const portions = orders.reduce((sum, o) => sum + Number(o.qty || 0), 0);
    const togo = orders.filter((o) => o.type === 'togo').reduce((s, o) => s + Number(o.qty || 0), 0);
    const dineIn = portions - togo;
    const dish = S.getDagensRet(today);
    const upcoming = S.getBookings().filter((b) => b.date >= today && b.status !== 'afvist');
    const newBookings = S.getBookings().filter((b) => b.status === 'ny').length;

    $('#view-overblik').innerHTML = `
      <div class="stats">
        <div class="stat stat--accent">
          <div class="stat__label">Kuverter i dag</div>
          <div class="stat__value">${portions}</div>
        </div>
        <div class="stat">
          <div class="stat__label">Bestillinger i dag</div>
          <div class="stat__value">${orders.length}</div>
        </div>
        <div class="stat">
          <div class="stat__label">To-go / spiser her</div>
          <div class="stat__value">${togo} <small>/</small> ${dineIn}</div>
        </div>
        <div class="stat">
          <div class="stat__label">Nye bookinger</div>
          <div class="stat__value">${newBookings}</div>
        </div>
      </div>

      <div class="acard">
        <div class="acard__head">
          <h2>🍲 Dagens ret i dag</h2>
          <button class="abtn abtn--ghost" data-goto="dagensret">Redigér ugeplan →</button>
        </div>
        ${dish
          ? `<div class="row"><div class="row__main">
               <div class="row__title">${esc(dish.title)} <span class="tag tag--accent">${dish.price ? kr(dish.price) : ''}</span></div>
               <div class="row__sub">${esc(dish.desc || '')}</div>
             </div></div>`
          : '<div class="empty">Der er ikke sat en dagens ret i dag. Gå til "Dagens ret" og planlæg den.</div>'}
      </div>

      <div class="acard">
        <div class="acard__head">
          <h2>🥡 Bestillinger af dagens ret i dag</h2>
          <span class="sub">${orders.length} bestilling${orders.length === 1 ? '' : 'er'} · ${portions} kuverter</span>
        </div>
        <div class="rowlist">
          ${orders.length ? orders.map((o) => orderRow(o)).join('') : '<div class="empty">Ingen bestillinger endnu i dag – de dukker op her, i samme sekund kunderne trykker "Send bestilling".</div>'}
        </div>
      </div>

      <div class="acard">
        <div class="acard__head">
          <h2>📅 Kommende bookinger</h2>
          <button class="abtn abtn--ghost" data-goto="bookinger">Se alle →</button>
        </div>
        <div class="rowlist">
          ${upcoming.length ? upcoming.slice(0, 5).map(bookingRow).join('') : '<div class="empty">Ingen kommende bookinger.</div>'}
        </div>
      </div>`;
  }

  /* ============================================================
     BESTILLINGER
     ============================================================ */
  let ordersDate = S.todayISO();

  function renderBestillinger() {
    const orders = S.getOrders(ordersDate);
    const portions = orders.reduce((s, o) => s + Number(o.qty || 0), 0);
    const dish = S.getDagensRet(ordersDate);

    $('#view-bestillinger').innerHTML = `
      <div class="acard">
        <div class="acard__head">
          <h2>Bestillinger</h2>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
            <button class="abtn abtn--ghost" id="ordersPrev">←</button>
            <input type="date" class="inline-input" id="ordersDate" value="${ordersDate}" style="width:170px;" />
            <button class="abtn abtn--ghost" id="ordersNext">→</button>
            <button class="abtn" id="ordersToday">I dag</button>
          </div>
        </div>
        <p class="sub" style="color:var(--ink-soft);margin-bottom:14px;">
          ${esc(S.formatDate(ordersDate))} · ${dish ? `Dagens ret: <strong>${esc(dish.title)}</strong> · ` : ''}${orders.length} bestillinger · ${portions} kuverter i alt
        </p>
        <div class="rowlist">
          ${orders.length ? orders.map((o) => orderRow(o)).join('') : '<div class="empty">Ingen bestillinger på denne dato.</div>'}
        </div>
      </div>`;

    $('#ordersDate').addEventListener('change', (e) => {
      if (e.target.value) { ordersDate = e.target.value; renderBestillinger(); }
    });
    $('#ordersPrev').addEventListener('click', () => { ordersDate = S.addDays(ordersDate, -1); renderBestillinger(); });
    $('#ordersNext').addEventListener('click', () => { ordersDate = S.addDays(ordersDate, 1); renderBestillinger(); });
    $('#ordersToday').addEventListener('click', () => { ordersDate = S.todayISO(); renderBestillinger(); });
  }

  /* ============================================================
     BOOKINGER
     ============================================================ */
  function renderBookinger() {
    const all = S.getBookings();
    const today = S.todayISO();
    const upcoming = all.filter((b) => b.date >= today);
    const past = all.filter((b) => b.date < today).reverse();
    const blocked = S.getBlockedDates().filter((d) => d >= today);

    $('#view-bookinger').innerHTML = `
      <div class="acard">
        <div class="acard__head">
          <h2>🚫 Luk dage for booking</h2>
          <span class="sub">Dage du blokerer, kan ikke vælges i bookingformularen på hjemmesiden.</span>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <input type="date" class="inline-input" id="blockDate" min="${today}" style="width:180px;" />
          <button class="abtn abtn--accent" id="blockBtn">Blokér dato</button>
        </div>
        <div class="blocked">
          ${blocked.length
            ? blocked.map((d) => `<span class="blocked__chip">${esc(S.formatDate(d))}<button data-unblock="${d}" aria-label="Fjern blokering">✕</button></span>`).join('')
            : '<span class="sub" style="color:var(--ink-soft);">Ingen blokerede dage.</span>'}
        </div>
      </div>

      <div class="acard">
        <div class="acard__head">
          <h2>📅 Kommende bookinger</h2>
          <span class="sub">${upcoming.length} i alt</span>
        </div>
        <div class="rowlist">
          ${upcoming.length ? upcoming.map(bookingRow).join('') : '<div class="empty">Ingen kommende bookinger endnu.</div>'}
        </div>
      </div>

      <div class="acard">
        <div class="acard__head"><h2>🗂 Tidligere bookinger</h2></div>
        <div class="rowlist">
          ${past.length ? past.slice(0, 10).map(bookingRow).join('') : '<div class="empty">Ingen tidligere bookinger.</div>'}
        </div>
      </div>`;

    $('#blockBtn').addEventListener('click', () => {
      const val = $('#blockDate').value;
      if (!val) { toast('Vælg en dato først'); return; }
      S.blockDate(val);
      renderBookinger();
      toast(`${S.formatDate(val)} er nu lukket for booking`);
    });
  }

  /* ============================================================
     DAGENS RET – planlægger
     ============================================================ */
  function renderDagensRetEditor() {
    const plan = S.getPlan(14);
    $('#view-dagensret').innerHTML = `
      <div class="acard">
        <div class="acard__head">
          <h2>🍲 Planlæg dagens ret</h2>
          <span class="sub">Udfyld ret, beskrivelse og pris – og tryk Gem. Hjemmesiden opdateres med det samme.</span>
        </div>
        <div class="planner">
          ${plan.map((day) => {
            const d = day.dish || { title: '', desc: '', price: '' };
            const isToday = day.iso === S.todayISO();
            return `
            <div class="planday ${day.open ? '' : 'planday--closed'} ${isToday ? 'planday--today' : ''}" data-iso="${day.iso}">
              <div class="planday__date">
                <strong>${day.weekday}${isToday ? ' · i dag' : ''}</strong>
                <small>${esc(S.formatDate(day.iso, false))}${day.open ? '' : ' · lukket'}</small>
              </div>
              <input class="inline-input" data-f="title" placeholder="${day.open ? 'Ret, fx Boller i karry' : 'Lukket'}" value="${esc(d.title)}" ${day.open ? '' : 'disabled'} />
              <input class="inline-input" data-f="desc" placeholder="Kort beskrivelse (valgfrit)" value="${esc(d.desc || '')}" ${day.open ? '' : 'disabled'} />
              <input class="inline-input" data-f="price" type="number" min="0" placeholder="Pris" value="${esc(d.price ?? '')}" ${day.open ? '' : 'disabled'} />
              <button class="abtn abtn--accent" data-act="save-day" ${day.open ? '' : 'disabled'}>Gem</button>
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  function saveDay(rowEl) {
    const iso = rowEl.dataset.iso;
    const title = $('[data-f="title"]', rowEl).value.trim();
    const desc = $('[data-f="desc"]', rowEl).value.trim();
    const priceRaw = $('[data-f="price"]', rowEl).value;
    const price = priceRaw ? Number(priceRaw) : null;
    if (!title) {
      S.setDagensRet(iso, null);
      toast(`${S.formatDate(iso)}: dagens ret fjernet`);
    } else {
      S.setDagensRet(iso, { title, desc, price });
      toast(`${S.formatDate(iso)}: "${title}" gemt ✓`);
    }
    renderBell();
  }

  /* ============================================================
     MENUKORT – editor
     ============================================================ */
  function renderMenuEditor() {
    const menu = S.getMenu();
    $('#view-menukort').innerHTML = `
      <div class="acard">
        <div class="acard__head">
          <h2>📖 Fast sortiment</h2>
          <button class="abtn abtn--accent" id="menuSave">Gem menukort</button>
        </div>
        <p class="sub" style="color:var(--ink-soft);margin-bottom:16px;">Redigér kategorier og retter. Tomme retter fjernes automatisk, når du gemmer.</p>
        <div id="menuCats">
          ${menu.categories.map((cat, ci) => `
            <div class="menued__cat" data-ci="${ci}">
              <div class="menued__catname">
                <input class="inline-input" data-f="catname" value="${esc(cat.name)}" placeholder="Kategorinavn" />
                <button class="abtn abtn--danger abtn--icon" data-act="del-cat" title="Slet kategori">🗑</button>
              </div>
              <div class="menued__items">
                ${cat.items.map((item, ii) => `
                  <div class="menued__item" data-ii="${ii}">
                    <input class="inline-input" data-f="name" value="${esc(item.name)}" placeholder="Navn" />
                    <input class="inline-input" data-f="desc" value="${esc(item.desc || '')}" placeholder="Beskrivelse" />
                    <input class="inline-input" data-f="price" type="number" min="0" value="${esc(item.price ?? '')}" placeholder="Pris" />
                    <button class="abtn abtn--danger abtn--icon" data-act="del-item" title="Fjern ret">✕</button>
                  </div>`).join('')}
              </div>
              <button class="abtn abtn--ghost" data-act="add-item">+ Tilføj ret</button>
            </div>`).join('')}
        </div>
        <button class="abtn" id="menuAddCat">+ Tilføj kategori</button>
      </div>

      <div class="acard">
        <div class="acard__head">
          <h2>📅 Ekstra retter pr. ugedag</h2>
          <span class="sub">Vises på menukortet under dagens ret for den valgte ugedag.</span>
        </div>
        <div id="menuWeekly">
          ${S.WEEKDAYS.map((day, wi) => `
            <div class="menued__cat" data-wi="${wi}">
              <div class="menued__catname"><strong style="padding:6px 4px;">${day}</strong></div>
              <div class="menued__items">
                ${(menu.weekly[wi] || []).map((item, ii) => `
                  <div class="menued__item" data-ii="${ii}">
                    <input class="inline-input" data-f="name" value="${esc(item.name)}" placeholder="Navn" />
                    <input class="inline-input" data-f="desc" value="${esc(item.desc || '')}" placeholder="Beskrivelse" />
                    <input class="inline-input" data-f="price" type="number" min="0" value="${esc(item.price ?? '')}" placeholder="Pris" />
                    <button class="abtn abtn--danger abtn--icon" data-act="del-witem" title="Fjern ret">✕</button>
                  </div>`).join('')}
              </div>
              <button class="abtn abtn--ghost" data-act="add-witem">+ Tilføj ret til ${day.toLowerCase()}</button>
            </div>`).join('')}
        </div>
        <button class="abtn abtn--accent" id="menuSave2">Gem menukort</button>
      </div>`;

    function collectAndSave() {
      const categories = $$('#menuCats .menued__cat').map((catEl) => ({
        id: `cat-${Math.random().toString(36).slice(2, 8)}`,
        name: $('[data-f="catname"]', catEl).value.trim() || 'Uden navn',
        items: $$('.menued__item', catEl).map((itemEl) => ({
          name: $('[data-f="name"]', itemEl).value.trim(),
          desc: $('[data-f="desc"]', itemEl).value.trim(),
          price: $('[data-f="price"]', itemEl).value ? Number($('[data-f="price"]', itemEl).value) : null,
        })).filter((i) => i.name),
      }));
      const weekly = $$('#menuWeekly .menued__cat').map((dayEl) =>
        $$('.menued__item', dayEl).map((itemEl) => ({
          name: $('[data-f="name"]', itemEl).value.trim(),
          desc: $('[data-f="desc"]', itemEl).value.trim(),
          price: $('[data-f="price"]', itemEl).value ? Number($('[data-f="price"]', itemEl).value) : null,
        })).filter((i) => i.name)
      );
      S.setMenu({ categories, weekly });
      toast('Menukortet er gemt ✓');
      renderMenuEditor();
    }
    $('#menuSave').addEventListener('click', collectAndSave);
    $('#menuSave2').addEventListener('click', collectAndSave);
    $('#menuAddCat').addEventListener('click', () => {
      const menu2 = collectCurrent();
      menu2.categories.push({ id: 'ny', name: '', items: [{ name: '', desc: '', price: null }] });
      S.setMenu(menu2);
      renderMenuEditor();
    });

    /* saml det aktuelle indhold uden at filtrere tomme felter (til add-knapper) */
    function collectCurrent() {
      return {
        categories: $$('#menuCats .menued__cat').map((catEl) => ({
          id: 'cat',
          name: $('[data-f="catname"]', catEl).value,
          items: $$('.menued__item', catEl).map((itemEl) => ({
            name: $('[data-f="name"]', itemEl).value,
            desc: $('[data-f="desc"]', itemEl).value,
            price: $('[data-f="price"]', itemEl).value ? Number($('[data-f="price"]', itemEl).value) : null,
          })),
        })),
        weekly: $$('#menuWeekly .menued__cat').map((dayEl) =>
          $$('.menued__item', dayEl).map((itemEl) => ({
            name: $('[data-f="name"]', itemEl).value,
            desc: $('[data-f="desc"]', itemEl).value,
            price: $('[data-f="price"]', itemEl).value ? Number($('[data-f="price"]', itemEl).value) : null,
          }))
        ),
      };
    }

    /* onclick (ikke addEventListener) så vi ikke stabler lyttere ved gen-render */
    $('#view-menukort').onclick = (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'add-item' || act === 'add-witem') {
        const menu2 = collectCurrent();
        if (act === 'add-item') {
          const ci = Number(btn.closest('.menued__cat').dataset.ci);
          menu2.categories[ci].items.push({ name: '', desc: '', price: null });
        } else {
          const wi = Number(btn.closest('.menued__cat').dataset.wi);
          menu2.weekly[wi].push({ name: '', desc: '', price: null });
        }
        S.setMenu(menu2);
        renderMenuEditor();
      } else if (act === 'del-cat') {
        if (!confirm('Slet hele kategorien?')) return;
        const menu2 = collectCurrent();
        menu2.categories.splice(Number(btn.closest('.menued__cat').dataset.ci), 1);
        S.setMenu(menu2);
        renderMenuEditor();
      } else if (act === 'del-item') {
        const menu2 = collectCurrent();
        const ci = Number(btn.closest('.menued__cat').dataset.ci);
        const ii = Number(btn.closest('.menued__item').dataset.ii);
        menu2.categories[ci].items.splice(ii, 1);
        S.setMenu(menu2);
        renderMenuEditor();
      } else if (act === 'del-witem') {
        const menu2 = collectCurrent();
        const wi = Number(btn.closest('.menued__cat').dataset.wi);
        const ii = Number(btn.closest('.menued__item').dataset.ii);
        menu2.weekly[wi].splice(ii, 1);
        S.setMenu(menu2);
        renderMenuEditor();
      }
    };
  }

  /* ============================================================
     ÅBNINGSTIDER
     ============================================================ */
  function renderHoursEditor() {
    const hours = S.getHours();
    $('#view-tider').innerHTML = `
      <div class="acard">
        <div class="acard__head">
          <h2>🕐 Åbningstider</h2>
          <button class="abtn abtn--accent" id="hoursSave">Gem åbningstider</button>
        </div>
        <p class="sub" style="color:var(--ink-soft);margin-bottom:16px;">Tiderne styrer også, hvilke afhentnings- og bookingtider kunderne kan vælge på hjemmesiden.</p>
        <div class="hoursgrid">
          ${hours.map((h, i) => `
            <div class="hoursrow ${h.closed ? 'hoursrow--closed' : ''}" data-day="${i}">
              <strong>${S.WEEKDAYS[i]}</strong>
              <label class="switch">
                <input type="checkbox" data-f="open-toggle" ${h.closed ? '' : 'checked'} />
                <i></i>
                <span data-f="toggle-label">${h.closed ? 'Lukket' : 'Åben'}</span>
              </label>
              <input class="inline-input" data-f="open" type="time" value="${h.open || '11:00'}" ${h.closed ? 'disabled' : ''} />
              <span class="dash">–</span>
              <input class="inline-input" data-f="close" type="time" value="${h.close || '19:00'}" ${h.closed ? 'disabled' : ''} />
              <span></span>
            </div>`).join('')}
        </div>
      </div>`;

    $$('#view-tider [data-f="open-toggle"]').forEach((toggle) => {
      toggle.addEventListener('change', () => {
        const row = toggle.closest('.hoursrow');
        const closed = !toggle.checked;
        row.classList.toggle('hoursrow--closed', closed);
        $('[data-f="open"]', row).disabled = closed;
        $('[data-f="close"]', row).disabled = closed;
        $('[data-f="toggle-label"]', row).textContent = closed ? 'Lukket' : 'Åben';
      });
    });

    $('#hoursSave').addEventListener('click', () => {
      const newHours = $$('#view-tider .hoursrow').map((row) => {
        const closed = !$('[data-f="open-toggle"]', row).checked;
        return {
          closed,
          open: closed ? '' : $('[data-f="open"]', row).value,
          close: closed ? '' : $('[data-f="close"]', row).value,
        };
      });
      S.setHours(newHours);
      toast('Åbningstiderne er gemt ✓');
    });
  }

  /* ============================================================
     INDSTILLINGER
     ============================================================ */
  function renderSettings() {
    const s = S.getSettings();
    $('#view-indstillinger').innerHTML = `
      <div class="acard">
        <div class="acard__head"><h2>⚙️ Kontaktoplysninger</h2></div>
        <div class="formgrid">
          <label class="afield"><span>Telefon</span><input id="setPhone" value="${esc(s.phone)}" /></label>
          <label class="afield"><span>E-mail</span><input id="setEmail" value="${esc(s.email)}" /></label>
          <label class="afield afield--full"><span>Adresse</span><input id="setAddress" value="${esc(s.address)}" /></label>
          <label class="afield afield--full"><span>Slogan</span><input id="setTagline" value="${esc(s.tagline)}" /></label>
        </div>
        <button class="abtn abtn--accent" id="setSave" style="margin-top:16px;">Gem oplysninger</button>
      </div>

      <div class="acard">
        <div class="acard__head"><h2>🔑 PIN-kode til admin</h2></div>
        <div class="formgrid">
          <label class="afield"><span>Ny PIN (4-8 cifre)</span><input id="setPin" inputmode="numeric" maxlength="8" placeholder="••••" /></label>
        </div>
        <button class="abtn" id="pinSave" style="margin-top:16px;">Skift PIN</button>
      </div>

      <div class="acard">
        <div class="acard__head"><h2>💾 Data</h2></div>
        <p class="sub" style="color:var(--ink-soft);margin-bottom:14px;">Download en sikkerhedskopi af alle bestillinger, bookinger og menuer – eller nulstil til demo-indholdet.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="abtn abtn--ghost" id="exportBtn">⬇ Download backup (JSON)</button>
          <button class="abtn abtn--danger" id="resetBtn">Nulstil alle data</button>
        </div>
      </div>`;

    $('#setSave').addEventListener('click', () => {
      S.updateSettings({
        phone: $('#setPhone').value.trim(),
        email: $('#setEmail').value.trim(),
        address: $('#setAddress').value.trim(),
        tagline: $('#setTagline').value.trim(),
      });
      toast('Oplysninger gemt ✓');
    });

    $('#pinSave').addEventListener('click', () => {
      const pin = $('#setPin').value.trim();
      if (!/^\d{4,8}$/.test(pin)) { toast('PIN skal være 4-8 cifre'); return; }
      S.updateSettings({ pin });
      $('#setPin').value = '';
      toast('PIN-koden er skiftet ✓');
    });

    $('#exportBtn').addEventListener('click', () => {
      const blob = new Blob([S.exportData()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `spiis-backup-${S.todayISO()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });

    $('#resetBtn').addEventListener('click', () => {
      if (!confirm('Er du sikker? Alle bestillinger, bookinger og menuændringer slettes og erstattes med demo-indhold.')) return;
      S.resetData();
      renderAll();
      toast('Alle data er nulstillet');
    });
  }

  /* ============================================================
     Fælles klik-håndtering (ordrer/bookinger/navigation)
     ============================================================ */
  document.addEventListener('click', (e) => {
    const goto = e.target.closest('[data-goto]');
    if (goto) {
      $(`.navitem[data-view="${goto.dataset.goto}"]`)?.click();
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const { act, id } = btn.dataset;

    if (act === 'save-day') { saveDay(btn.closest('.planday')); return; }

    if (act === 'order-done') { S.updateOrder(id, { status: 'haandteret', read: true }); }
    else if (act === 'order-undo') { S.updateOrder(id, { status: 'ny' }); }
    else if (act === 'order-del') {
      if (!confirm('Slet denne bestilling?')) return;
      S.deleteOrder(id);
    }
    else if (act === 'booking-ok') { S.updateBooking(id, { status: 'bekraeftet', read: true }); toast('Booking bekræftet – husk at ringe til kunden ✓'); }
    else if (act === 'booking-no') { S.updateBooking(id, { status: 'afvist', read: true }); }
    else if (act === 'booking-del') {
      if (!confirm('Slet denne booking?')) return;
      S.deleteBooking(id);
    }
    else return;

    renderBell();
    renderListViews();
  });

  const unblockHandler = (e) => {
    const btn = e.target.closest('[data-unblock]');
    if (!btn) return;
    S.unblockDate(btn.dataset.unblock);
    renderBookinger();
    toast('Dagen er åben for booking igen');
  };
  document.addEventListener('click', unblockHandler);

  /* ---------- render ---------- */
  /* Gen-render kun liste-views automatisk – aldrig editor-views,
     så chefen ikke mister det, hun er i gang med at skrive. */
  function renderListViews() {
    if (activeView === 'overblik') renderOverblik();
    if (activeView === 'bestillinger') renderBestillinger();
    if (activeView === 'bookinger') renderBookinger();
  }

  function renderAll() {
    renderTopbarDate();
    renderBell();
    renderView(activeView);
  }

  S.subscribe(() => {
    if (app.hidden) return;
    renderBell();
    renderListViews();
  });

  /* ---------- start ---------- */
  if (isAuthed()) showApp();
})();
