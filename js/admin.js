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
    /* sky: rigtigt login · lokalt: PIN-flag */
    return S.hasSession() || localStorage.getItem(AUTH_KEY) === '1';
  }
  function showApp() {
    loginScreen.hidden = true;
    app.hidden = false;
    if (S.isCloud()) S.startAdminPolling();
    renderAll();
    renderPwaBanner();
    refreshPushSubscription();
    liveAlerts(); /* sæt live-alarmens nulpunkt til det, der allerede er hentet */
  }

  /* skift login-formularen til e-mail/adgangskode, når skyen er aktiv */
  function syncLoginMode() {
    const emailInput = $('#loginEmail');
    const pinInput = $('#loginPin');
    if (S.isCloud() && emailInput.hidden) {
      emailInput.hidden = false;
      emailInput.value = S.getSettings().email || '';
      pinInput.placeholder = 'Adgangskode';
      pinInput.maxLength = 64;
      pinInput.removeAttribute('inputmode');
      pinInput.classList.add('is-password');
      $('#loginHint').textContent = 'Log ind med chefens e-mail og adgangskode.';
      $('#loginError').textContent = 'Forkert e-mail eller adgangskode.';
    }
    if (S.isCloudConfigured() && S.isCloudDown()) {
      $('#loginHint').textContent = '⚠️ Ingen forbindelse til databasen lige nu – tjek internettet og genindlæs siden.';
    }
  }
  syncLoginMode();

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = $('#loginError');
    if (S.isCloud() || !$('#loginEmail').hidden) {
      const btn = $('#loginSubmit');
      btn.disabled = true;
      btn.textContent = 'Logger ind…';
      const result = await S.adminLogin($('#loginEmail').value.trim(), $('#loginPin').value);
      btn.disabled = false;
      btn.textContent = 'Log ind';
      if (result.ok) {
        errorEl.hidden = true;
        showApp();
      } else {
        errorEl.textContent = result.msg || 'Forkert e-mail eller adgangskode.';
        errorEl.hidden = false;
      }
      return;
    }
    const pin = $('#loginPin').value.trim();
    if (pin === S.getSettings().pin) {
      localStorage.setItem(AUTH_KEY, '1');
      errorEl.hidden = true;
      showApp();
    } else {
      errorEl.hidden = false;
      $('#loginPin').value = '';
      $('#loginPin').focus();
    }
  });
  $('#logoutBtn').addEventListener('click', () => {
    S.logout();
    localStorage.removeItem(AUTH_KEY);
    location.reload();
  });

  /* ============================================================
     APP & PUSH-NOTIFIKATIONER
     Admin kan installeres som app på telefonen og få push-besked
     ved nye bestillinger/bookinger – også når appen er lukket.
     ============================================================ */
  let swReg = null;
  let installEvent = null;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then((r) => { swReg = r; })
      .catch(() => { /* fx file:// eller gammel browser – appen virker stadig */ });
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e;
    renderPwaBanner();
  });

  const pushSupported = () =>
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const isInstalled = () =>
    window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  /* iPhone/iPad: ingen automatisk installations-prompt – der skal Safaris Del-knap til */
  const isIOS = () =>
    /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isIOSChrome = () => isIOS() && /CriOS/.test(navigator.userAgent);

  function urlB64ToBytes(s) {
    const pad = '='.repeat((4 - (s.length % 4)) % 4);
    const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }

  async function enablePush() {
    if (!pushSupported() || !window.SPIIS_PUSH || !S.isCloud()) {
      toast('Notifikationer kræver forbindelse til databasen');
      return false;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      toast('Du skal tillade notifikationer for at få besked');
      renderPwaBanner();
      return false;
    }
    try {
      const reg = swReg || await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToBytes(window.SPIIS_PUSH.publicKey),
      });
      const saved = await S.savePushSubscription(sub);
      toast(saved.ok
        ? '🔔 Notifikationer er slået til på denne telefon ✓'
        : 'Næsten! Databasen mangler notifikations-opdateringen (SQL)');
      renderPwaBanner();
      return saved.ok;
    } catch {
      toast('Kunne ikke slå notifikationer til – prøv igen');
      renderPwaBanner();
      return false;
    }
  }

  /* holder abonnementet friskt: er der allerede givet lov, gemmes det igen i databasen */
  async function refreshPushSubscription() {
    if (!pushSupported() || !S.isCloud() || Notification.permission !== 'granted') return;
    try {
      const reg = swReg || await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) S.savePushSubscription(sub);
    } catch { /* ignorér */ }
  }

  function renderPwaBanner() {
    const el = $('#pwaBanner');
    if (!el || app.hidden) return;
    const bits = [];
    if (installEvent && !isInstalled()) {
      bits.push(`
        <div class="pwa"><span>📲</span>
          <div><strong>Installér Spiis Admin som app</strong>
          <small>Eget ikon på telefonen – åbner uden browser-bjælke.</small></div>
          <button class="abtn abtn--accent" data-pwa="install">Installér</button>
        </div>`);
    }
    if (isIOS() && !isInstalled()) {
      bits.push(`
        <div class="pwa"><span>📲</span>
          <div><strong>Installér som app på din iPhone</strong>
          <small>${isIOSChrome()
            ? 'Åbn spiis.dk/admin i <b>Safari</b> → tryk på Del-knappen (firkant med pil op) → vælg <b>»Føj til hjemmeskærm«</b>.'
            : 'Tryk på <b>Del-knappen</b> (firkant med pil op) → scroll ned → vælg <b>»Føj til hjemmeskærm«</b>.'}</small></div>
        </div>`);
    }
    if (pushSupported() && S.isCloud() && Notification.permission === 'default') {
      bits.push(`
        <div class="pwa pwa--push"><span>🔔</span>
          <div><strong>Vigtigt: slå notifikationer til på denne telefon</strong>
          <small>Så siger telefonen til ved nye bestillinger og bookinger – også når appen er lukket. Skal slås til igen, hvis appen har været slettet og installeret på ny.</small></div>
          <button class="abtn abtn--accent" data-pwa="push">Slå til</button>
        </div>`);
    }
    el.innerHTML = bits.join('');
    el.hidden = bits.length === 0;
    el.querySelector('[data-pwa="install"]')?.addEventListener('click', async () => {
      if (!installEvent) return;
      installEvent.prompt();
      await installEvent.userChoice.catch(() => {});
      installEvent = null;
      renderPwaBanner();
    });
    el.querySelector('[data-pwa="push"]')?.addEventListener('click', enablePush);
  }

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
      ...unread.orders.map((o) => {
        const lines = orderLines(o);
        const summary = lines.slice(0, 3).map((l) => `${l.qty} × ${l.name}`).join(' · ') + (lines.length > 3 ? ' · …' : '');
        return {
          icon: '🥡',
          title: `Ny bestilling: ${summary}`,
          sub: `${o.name} · ${S.formatDate(o.date)} kl. ${o.time} · ${o.type === 'togo' ? 'To-go' : 'Spiser her'}${o.persons ? ` · ${o.persons} pers.` : ''}`,
          at: o.createdAt,
        };
      }),
      ...unread.bookings.map((b) => ({
        icon: b.kind === 'moede' ? '📅' : '🎉',
        title: `${b.kind === 'moede' ? 'Ny mødebooking' : 'Ny arrangement-forespørgsel'}: ${b.subject}`,
        sub: `${b.name} · ${b.date ? `${S.formatDate(b.date)}${b.time ? ` kl. ${b.time}` : ''}` : 'dato ikke fastlagt'}`,
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
    uge: 'Ugeoverblik',
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
      uge: renderUge,
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
  /* en bestilling kan indeholde flere retter (items) – ældre
     bestillinger har kun dish/qty og vises som før */
  function orderLines(o) {
    if (o.items && o.items.length) return o.items.filter((l) => Number(l.qty) > 0);
    return Number(o.qty) > 0 ? [{ name: o.dish || 'Dagens ret', qty: o.qty, price: o.price, kind: 'dagensret' }] : [];
  }
  const personsOf = (o) => (o.persons != null ? Number(o.persons) : Number(o.qty || 0));
  const itemsOf = (o) => orderLines(o).reduce((s, l) => s + Number(l.qty), 0);

  /* læg alle bestilte retter sammen pr. navn (til produktionslisten) */
  function dishTotals(orders) {
    const map = new Map();
    orders.forEach((o) => orderLines(o).forEach((l) => {
      map.set(l.name, (map.get(l.name) || 0) + Number(l.qty));
    }));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }

  /* samme, men delt op i to-go / spiser her pr. ret */
  function dishTotalsSplit(orders) {
    const map = new Map();
    orders.forEach((o) => orderLines(o).forEach((l) => {
      const e = map.get(l.name) || { total: 0, togo: 0, spise: 0 };
      e.total += Number(l.qty);
      e[o.type === 'togo' ? 'togo' : 'spise'] += Number(l.qty);
      map.set(l.name, e);
    }));
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }

  /* dagens forløb: bestillinger + dagens møder i tidsorden
     (arrangementer har deres egen sektion i køreplanen) */
  function dayTimeline(iso) {
    const entries = [
      ...S.getOrders(iso).map((o) => ({ time: o.time || '', kind: 'order', o })),
      ...S.getBookings()
        .filter((b) => b.date === iso && b.status !== 'afvist' && b.kind !== 'arrangement')
        .map((b) => ({ time: b.time || '', kind: 'booking', b })),
    ];
    /* poster uden tidspunkt (fx aftalte arrangementer uden fast tid) først */
    return entries.sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));
  }

  /* hvor længe har en henvendelse ventet – og hvor tæt på er en aftale? */
  function daysUntil(iso) {
    return Math.round((new Date(iso + 'T12:00') - new Date(S.todayISO() + 'T12:00')) / 86400000);
  }
  function proximityLabel(iso) {
    const d = daysUntil(iso);
    if (d <= 0) return 'i dag';
    if (d === 1) return 'i morgen';
    if (d < 14) return `om ${d} dage`;
    return `om ${Math.round(d / 7)} uger`;
  }
  function waitingLabel(createdAt) {
    if (!createdAt) return '';
    const days = Math.floor((Date.now() - new Date(createdAt)) / 86400000);
    if (days <= 0) return 'kom i dag';
    if (days === 1) return 'har ventet 1 dag';
    return `har ventet ${days} dage`;
  }

  /* navne på drikkevarer, så bestillinger kan deles i mad / drikke */
  function drinkNameSet() {
    const set = new Set();
    S.getMenu().categories.forEach((c) => {
      if (/drik/i.test(c.name || '') || /drik/i.test(c.id || '')) {
        c.items.forEach((i) => set.add(i.name));
      }
    });
    return set;
  }

  function orderRow(o, showDate = false) {
    const all = orderLines(o);
    const drinks = drinkNameSet();
    const isDrink = (l) => (l.cat ? /drik/i.test(l.cat) : drinks.has(l.name));
    const food = all.filter((l) => !isDrink(l));
    const drink = all.filter(isDrink);
    const li = (l) => `<li><b>${l.qty} ×</b> ${esc(l.name)}${l.kind === 'dagensret' ? '<span class="tag tag--accent">Dagens ret</span>' : ''}</li>`;
    const done = o.status !== 'ny';
    return `
      <div class="row ${done ? 'row--done' : 'row--new'}">
        <div class="row__main">
          <div class="row__title">${esc(o.name)}
            ${personsOf(o) ? `<span class="tag">👥 ${personsOf(o)} pers.</span>` : ''}
            <span class="tag ${o.type === 'togo' ? 'tag--accent' : 'tag--ink'}">${o.type === 'togo' ? '🥡 To-go' : '🍽️ Spiser her'}</span>
            ${done ? '' : '<span class="tag tag--red">Ny</span>'}
          </div>
          ${food.length ? `<ul class="olist">${food.map(li).join('')}</ul>` : ''}
          ${drink.length ? `<div class="olist__sep"></div><ul class="olist olist--drinks">${drink.map(li).join('')}</ul>` : ''}
          <div class="row__sub">
            ${showDate ? `${esc(S.formatDate(o.date))} · ` : ''}kl. ${esc(o.time)} · 📞 ${esc(o.phone)}
            ${o.note ? ` · 💬 ${esc(o.note)}` : ''}
          </div>
        </div>
        <div class="row__actions">
          ${done
            ? `<button class="checkbtn is-done" data-act="order-toggle" data-id="${o.id}" title="Færdig – tryk igen for at fjerne fluebenet" aria-label="Færdig">✓</button>`
            : `<button class="abtn abtn--green" data-act="order-toggle" data-id="${o.id}">✓ Færdig</button>`}
          <button class="abtn abtn--danger abtn--icon" data-act="order-del" data-id="${o.id}" aria-label="Slet">🗑</button>
        </div>
      </div>`;
  }

  function bookingRow(b) {
    const isMoede = b.kind === 'moede';
    const statusTag = {
      ny: `<span class="tag tag--red">Ny</span>${waitingLabel(b.createdAt) ? `<span class="tag tag--wait">⏳ ${waitingLabel(b.createdAt)}</span>` : ''}`,
      bekraeftet: `<span class="tag tag--green">${isMoede ? 'Bekræftet' : 'Aftalt'}</span>`,
      afvist: '<span class="tag">Afvist</span>',
    }[b.status] || '';
    const when = b.date
      ? `${esc(S.formatDate(b.date))}${b.time ? ` kl. ${esc(b.time)}` : ''}${b.status === 'bekraeftet' && daysUntil(b.date) > 0 ? ` <b class="when-soon">(${proximityLabel(b.date)})</b>` : ''}`
      : '📆 Dato ikke fastlagt endnu';
    return `
      <div class="row ${isMoede ? 'row--moede' : 'row--arr'} ${b.status === 'ny' ? 'row--new' : ''}">
        <div class="row__main">
          <div class="row__title">${isMoede ? '📅' : '🎉'} ${esc(b.subject)}
            <span class="tag ${isMoede ? 'tag--moede' : 'tag--accent'}">${isMoede ? '📅 Møde' : '🎉 Arrangement'}</span>
            ${statusTag}
            ${!isMoede && b.status === 'bekraeftet' ? (b.block_orders === false
              ? '<span class="tag tag--green">🍲 Åbent for bestillinger</span>'
              : '<span class="tag tag--red">🍲 Lukket for bestillinger</span>') : ''}
          </div>
          <div class="row__sub">
            ${when} · ${esc(b.name)} · 📞 ${esc(b.phone)}${b.email ? ` · ✉️ ${esc(b.email)}` : ''}
            ${b.desc ? `<br/>💬 ${esc(b.desc)}` : ''}
          </div>
          ${b.staff_note ? `<div class="staffnote">📝 ${esc(b.staff_note)}</div>` : ''}
        </div>
        <div class="row__actions">
          <button class="abtn ${b.status === 'bekraeftet' ? 'abtn--ghost' : 'abtn--green'}" data-act="booking-edit" data-id="${b.id}">${b.status === 'bekraeftet' ? '🖉 Ret / notér' : (isMoede ? '✓ Bekræft & sæt tid' : '✓ Aftal & sæt tid')}</button>
          ${b.status !== 'afvist' ? `<button class="abtn abtn--ghost" data-act="booking-no" data-id="${b.id}">Afvis</button>` : ''}
          <button class="abtn abtn--danger abtn--icon" data-act="booking-del" data-id="${b.id}" aria-label="Slet">🗑</button>
        </div>
        <div class="bkedit" hidden>
          <label class="afield"><span>Dato</span><input type="date" class="bkedit__date" value="${esc(b.date || '')}" /></label>
          <label class="afield"><span>Tidspunkt</span><select class="bkedit__time"></select></label>
          <label class="afield afield--wide"><span>Intern note <em>(kun til jer – aldrig synlig for kunder)</em></span><textarea class="bkedit__note" rows="2" placeholder="Fx: Dæk op til 20 på venstre fløj med servietter, bestik og flag">${esc(b.staff_note || '')}</textarea></label>
          ${isMoede ? '' : `
          <label class="bkedit__check">
            <input type="checkbox" class="bkedit__block" ${b.block_orders === false ? '' : 'checked'} />
            <span><strong>🍲 Luk for almindelige madbestillinger denne dag</strong><br/>
            <em>Fjern fluebenet ved små arrangementer, hvor Spiis holder åbent som normalt.</em></span>
          </label>
          <div class="bkedit__hint">🚫 Dagen blokeres altid for nye arrangement-forespørgsler, når du gemmer – fluebenet ovenfor bestemmer, om der også lukkes for madbestillinger. Alt åbner igen, hvis arrangementet flyttes, afvises eller slettes.</div>`}
          <button class="abtn abtn--accent" data-act="booking-save" data-id="${b.id}">✓ Gem</button>
          <button class="abtn abtn--ghost" data-act="booking-close">Luk</button>
        </div>
      </div>`;
  }

  function renderOverblik() {
    const today = S.todayISO();
    const orders = S.getOrders(today);
    const persons = orders.reduce((s, o) => s + personsOf(o), 0);
    const itemsTotal = orders.reduce((s, o) => s + itemsOf(o), 0);
    const togo = orders.filter((o) => o.type === 'togo').reduce((s, o) => s + personsOf(o), 0);
    const dineIn = persons - togo;
    const dish = S.getDagensRet(today);
    const dagensSold = S.getSold(today);
    const totalsSplit = dishTotalsSplit(orders);
    const timeline = dayTimeline(today);
    const todaysArrangements = S.getBookings().filter((b) =>
      b.date === today && b.kind === 'arrangement' && b.status !== 'afvist');
    /* dagens bookinger står i køreplanen – her vises kun et kort overblik */
    const waitingCount = S.getBookings().filter((b) => b.status === 'ny').length;
    const nextUp = S.getBookings()
      .filter((b) => b.status === 'bekraeftet' && b.date && b.date > today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 3);
    const newBookings = waitingCount;

    $('#view-overblik').innerHTML = `
      <div class="stats">
        <div class="stat stat--accent">
          <div class="stat__label">Personer i dag</div>
          <div class="stat__value">${persons}</div>
        </div>
        <div class="stat">
          <div class="stat__label">Retter i alt</div>
          <div class="stat__value">${itemsTotal}</div>
        </div>
        <div class="stat">
          <div class="stat__label">Dagens ret solgt</div>
          <div class="stat__value">${dagensSold}${dish && dish.stock != null && dish.stock !== '' ? ` <small>/ ${dish.stock}</small>` : ''}</div>
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
          <h2>📋 Dagens køreplan</h2>
          <span class="sub">${esc(S.formatDate(today))} · det ene sted, der skal tjekkes, når I møder ind</span>
        </div>

        ${todaysArrangements.length ? `
        <h3 class="kp__sub">🎉 Dagens arrangementer</h3>
        <div class="rowlist rowlist--arr">
          ${todaysArrangements.map(bookingRow).join('')}
        </div>` : ''}

        <h3 class="kp__sub">🧾 Produktion i alt</h3>
        ${totalsSplit.length
          ? `<div class="prodlist">${totalsSplit.map(([n, t]) => `<span class="prod"><b>${t.total}</b>${esc(n)}<em>🥡 ${t.togo} · 🍽️ ${t.spise}</em></span>`).join('')}</div>`
          : '<div class="empty">Ingen bestillinger endnu – listen fyldes op, efterhånden som kunderne bestiller.</div>'}

        <h3 class="kp__sub">⏰ Dagens forløb</h3>
        ${timeline.length ? `
        <div class="timeline">
          ${timeline.map((e) => `
            <div class="tl">
              <div class="tl__time">${e.time ? `kl.<br/>${esc(e.time)}` : '<small>tid<br/>aftales</small>'}</div>
              ${e.kind === 'order' ? orderRow(e.o) : bookingRow(e.b)}
            </div>`).join('')}
        </div>` : '<div class="empty">Ingen bestillinger eller aftaler endnu i dag.</div>'}
      </div>

      <div class="acard">
        <div class="acard__head">
          <h2>🍲 Dagens ret i dag</h2>
          <button class="abtn abtn--ghost" data-goto="dagensret">Redigér ugeplan →</button>
        </div>
        ${dish
          ? `<div class="row"><div class="row__main">
               <div class="row__title">${esc(dish.title)}
                 ${dish.price ? `<span class="tag tag--accent">${kr(dish.price)}</span>` : ''}
                 ${dish.stock != null && dish.stock !== '' ? `<span class="tag ${S.getSold(today) >= dish.stock ? 'tag--red' : 'tag--green'}">${S.getSold(today)}/${dish.stock} solgt</span>` : ''}
               </div>
               <div class="row__sub">${esc(dish.desc || '')}</div>
             </div></div>`
          : '<div class="empty">Der er ikke sat en dagens ret i dag. Gå til "Dagens ret" og planlæg den.</div>'}
      </div>

      <div class="acard">
        <div class="acard__head">
          <h2>📅 Bookinger</h2>
          <button class="abtn abtn--ghost" data-goto="bookinger">Åbn overblikket →</button>
        </div>
        ${waitingCount ? `
        <button class="waitalert" data-goto="bookinger">⏳ <strong>${waitingCount} venter på svar</strong> – ring og få dem på plads →</button>` : ''}
        ${nextUp.length ? `
        <div class="nextlist">
          ${nextUp.map((b) => `
            <div class="nextb">
              <b class="nextb__when">${proximityLabel(b.date)}</b>
              <span class="nextb__what">${b.kind === 'moede' ? '📅' : '🎉'} ${esc(b.subject)}</span>
              <span class="nextb__sub">${esc(S.formatDate(b.date, false))}${b.time ? ` kl. ${esc(b.time)}` : ''} · ${esc(b.name)}</span>
            </div>`).join('')}
        </div>` : (waitingCount ? '' : '<div class="empty">Ingen nye forespørgsler eller kommende aftaler.</div>')}
      </div>`;
  }

  /* ============================================================
     UGEOVERBLIK – dashboard pr. dag med noter
     ============================================================ */
  let ugeStart = S.weekStart(S.todayISO());

  function renderUge() {
    const today = S.todayISO();
    const allBookings = S.getBookings();
    const days = [];
    for (let i = 0; i < 7; i++) days.push(S.addDays(ugeStart, i));
    const weekEnd = days[6];

    /* uge-total */
    const weekOrders = days.flatMap((iso) => S.getOrders(iso));
    const weekItems = weekOrders.reduce((s, o) => s + itemsOf(o), 0);
    const weekPersons = weekOrders.reduce((s, o) => s + personsOf(o), 0);
    const weekBookings = allBookings.filter((b) => b.date >= ugeStart && b.date <= weekEnd && b.status !== 'afvist');

    $('#view-uge').innerHTML = `
      <div class="acard">
        <div class="acard__head">
          <h2>📆 Uge ${S.weekNumber(ugeStart)} <span class="sub" style="font-family:var(--font-body);font-weight:500;">· ${esc(S.formatDate(ugeStart, false))} – ${esc(S.formatDate(weekEnd, false))}</span></h2>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button class="abtn abtn--ghost" id="ugePrev">← Forrige uge</button>
            <button class="abtn" id="ugeToday">Denne uge</button>
            <button class="abtn abtn--ghost" id="ugeNext">Næste uge →</button>
          </div>
        </div>
        <p class="sub" style="color:var(--ink-soft);">
          Hele ugen: <strong>${weekOrders.length}</strong> bestillinger · <strong>${weekItems}</strong> retter · <strong>${weekPersons}</strong> personer · <strong>${weekBookings.length}</strong> booking${weekBookings.length === 1 ? '' : 'er'}
        </p>
      </div>

      <div class="ugegrid">
        ${days.map((iso) => {
          const orders = S.getOrders(iso);
          const dayItems = orders.reduce((s, o) => s + itemsOf(o), 0);
          const dayPersons = orders.reduce((s, o) => s + personsOf(o), 0);
          const togo = orders.filter((o) => o.type === 'togo').reduce((s, o) => s + personsOf(o), 0);
          const dish = S.getDagensRet(iso);
          const sold = S.getSold(iso);
          const totals = dishTotals(orders);
          const bookings = allBookings.filter((b) => b.date === iso && b.status !== 'afvist');
          const isToday = iso === today;
          const closed = !S.isOpenDay(iso);
          return `
          <div class="acard ugeday ${isToday ? 'ugeday--today' : ''} ${closed ? 'ugeday--closed' : ''}">
            <div class="ugeday__head">
              <strong>${S.WEEKDAYS[S.weekdayIndex(iso)]}${isToday ? ' · i dag' : ''}</strong>
              <span>${esc(S.formatDate(iso, false))}${closed ? ' · lukket' : ''}</span>
            </div>
            <div class="ugeday__dish">
              ${dish
                ? `🍲 ${esc(dish.title)}${dish.stock != null && dish.stock !== '' ? ` <span class="tag ${sold >= dish.stock ? 'tag--red' : 'tag--accent'}">${sold}/${dish.stock} solgt</span>` : ''}`
                : '<span style="color:var(--ink-soft);">Ingen dagens ret sat</span>'}
            </div>
            <div class="ugeday__stats">
              <span><strong>${orders.length}</strong> bestillinger</span>
              <span><strong>${dayItems}</strong> retter</span>
              <span><strong>${dayPersons}</strong> pers.</span>
              <span>🥡 <strong>${togo}</strong> · 🍽️ <strong>${dayPersons - togo}</strong></span>
            </div>
            ${totals.length ? `<div class="ugeday__top">${totals.slice(0, 3).map(([n, q]) => `${q} × ${esc(n)}`).join(' · ')}${totals.length > 3 ? ' · …' : ''}</div>` : ''}
            ${bookings.length ? `
              <div class="ugeday__bookings">
                ${bookings.map((b) => `<div>${b.kind === 'moede' ? '📅' : '🎉'} ${b.time ? `kl. ${esc(b.time)} · ` : ''}${esc(b.subject)} <em>(${esc(b.name)})</em></div>`).join('')}
              </div>` : ''}
            <textarea class="inline-input ugeday__note" data-note="${iso}" rows="2" placeholder="Noter til dagen – fx 'Husk ekstra pommes'…">${esc(S.getNote(iso))}</textarea>
            <div class="ugeday__actions">
              <button class="abtn abtn--accent" data-act="save-note" data-iso="${iso}">Gem note</button>
              <button class="abtn abtn--ghost" data-act="goto-orders" data-iso="${iso}">Se bestillinger →</button>
            </div>
          </div>`;
        }).join('')}
      </div>`;

    $('#ugePrev').addEventListener('click', () => { ugeStart = S.addDays(ugeStart, -7); renderUge(); });
    $('#ugeNext').addEventListener('click', () => { ugeStart = S.addDays(ugeStart, 7); renderUge(); });
    $('#ugeToday').addEventListener('click', () => { ugeStart = S.weekStart(S.todayISO()); renderUge(); });
  }

  /* ============================================================
     BESTILLINGER
     ============================================================ */
  let ordersDate = S.todayISO();

  function renderBestillinger() {
    const orders = S.getOrders(ordersDate);
    const itemsTotal = orders.reduce((s, o) => s + itemsOf(o), 0);
    const persons = orders.reduce((s, o) => s + personsOf(o), 0);
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
          ${esc(S.formatDate(ordersDate))} · ${dish ? `Dagens ret: <strong>${esc(dish.title)}</strong> · ` : ''}${orders.length} bestillinger · ${itemsTotal} retter · ${persons} personer
        </p>
        ${orders.length ? `<div class="prodlist" style="margin-bottom:16px;">${dishTotals(orders).map(([n, q]) => `<span class="prod"><b>${q}</b>${esc(n)}</span>`).join('')}</div>` : ''}
        <div class="rowlist">
          ${orders.length ? orders.map((o) => orderRow(o)).join('') : '<div class="empty">Ingen bestillinger på denne dato.</div>'}
        </div>
      </div>`;

    /* Spiis-kalender med prik på dage, der har bestillinger */
    SpiisDatepicker.attach($('#ordersDate'), {
      marker: (iso) => S.getOrders(iso).length > 0,
    });

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

    /* pipelinen: i dag → venter på jer → på plads → arkiv */
    const todays = all.filter((b) => b.status === 'bekraeftet' && b.date === today);
    const waiting = all.filter((b) => b.status === 'ny')
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    const waitingArr = waiting.filter((b) => b.kind !== 'moede');
    const waitingMoede = waiting.filter((b) => b.kind === 'moede');
    const upcoming = all.filter((b) => b.status === 'bekraeftet' && b.date && b.date > today)
      .sort((a, b) => a.date.localeCompare(b.date));
    const past = all.filter((b) => b.status !== 'ny' && !upcoming.includes(b) && !todays.includes(b)).reverse();
    const blocked = S.getBlockedDates().filter((d) => d >= today);
    const autoBlocked = S.getArrangementDates().filter((d) => d >= today && !blocked.includes(d));

    $('#view-bookinger').innerHTML = `
      <div class="pipebar">
        <span class="pipebar__chip ${waiting.length ? 'is-hot' : ''}">⏳ ${waiting.length} venter på svar</span>
        <span class="pipebar__chip">✅ ${upcoming.length} på plads</span>
        <span class="pipebar__chip ${todays.length ? 'is-today' : ''}">🎉 ${todays.length} i dag</span>
      </div>

      ${todays.length ? `
      <div class="acard acard--today">
        <div class="acard__head">
          <h2>🔴 I dag</h2>
          <span class="sub">det her sker i dag – tjek noterne</span>
        </div>
        <div class="rowlist">${todays.map(bookingRow).join('')}</div>
      </div>` : ''}

      <div class="acard">
        <div class="acard__head">
          <h2>📞 Venter på jer</h2>
          <span class="sub">ældste øverst – ring og få dem på plads</span>
        </div>
        ${waitingArr.length ? `
        <h3 class="kp__sub">🎉 Arrangement-forespørgsler <em class="kp__sub-hint">· ring til kunden og aftal</em></h3>
        <div class="rowlist">${waitingArr.map(bookingRow).join('')}</div>` : ''}
        ${waitingMoede.length ? `
        <h3 class="kp__sub">📅 Mødebookinger <em class="kp__sub-hint">· bekræft tiden</em></h3>
        <div class="rowlist">${waitingMoede.map(bookingRow).join('')}</div>` : ''}
        ${!waiting.length ? '<div class="empty">Ingen ubesvarede lige nu – flot! 🎉</div>' : ''}
      </div>

      <div class="acard">
        <div class="acard__head">
          <h2>✅ På plads</h2>
          <span class="sub">${upcoming.length ? `${upcoming.length} kommende – nærmeste først` : 'aftalte arrangementer og møder lander her'}</span>
        </div>
        <div class="rowlist">
          ${upcoming.length ? upcoming.map(bookingRow).join('') : '<div class="empty">Ingen kommende aftaler endnu.</div>'}
        </div>
      </div>

      <details class="acard acard--fold">
        <summary class="acard__head acard__head--sum">
          <h2>🗂 Arkiv</h2>
          <span class="sub">${past.length} tidligere & afviste</span>
        </summary>
        <div class="rowlist" style="margin-top:14px;">
          ${past.length ? past.slice(0, 15).map(bookingRow).join('') : '<div class="empty">Ingen endnu.</div>'}
        </div>
      </details>

      <div class="acard">
        <div class="acard__head">
          <h2>🚫 Luk dage</h2>
          <span class="sub">Lukkede dage kan hverken vælges til booking eller madbestilling på hjemmesiden. Dage med et aftalt arrangement lukkes helt automatisk.</span>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <input type="date" class="inline-input" id="blockDate" min="${today}" style="width:180px;" />
          <button class="abtn abtn--accent" id="blockBtn">Blokér dato</button>
        </div>
        <div class="blocked">
          ${blocked.length || autoBlocked.length
            ? blocked.map((d) => `<span class="blocked__chip">${esc(S.formatDate(d))}<button data-unblock="${d}" aria-label="Fjern blokering">✕</button></span>`).join('')
              + autoBlocked.map((d) => `<span class="blocked__chip blocked__chip--auto" title="Blokeres automatisk, fordi der er et aftalt arrangement. Fjernes, hvis arrangementet flyttes, afvises eller slettes.">🎉 ${esc(S.formatDate(d))}</span>`).join('')
            : '<span class="sub" style="color:var(--ink-soft);">Ingen blokerede dage.</span>'}
        </div>
      </div>`;

    /* Spiis-kalender: blokerede dage OG dage med aftalt arrangement vises med rødt */
    SpiisDatepicker.attach($('#blockDate'), {
      min: today,
      legend: true,
      state: (iso) => {
        if (!S.isOpenDay(iso)) return 'closed';
        if (S.getBlockedDates().includes(iso)) return 'blocked';
        if (S.getArrangementDates().includes(iso)) return 'blocked';
        return 'ok';
      },
    });

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
            const d = day.dish || { title: '', desc: '', price: '', stock: '' };
            const isToday = day.iso === S.todayISO();
            const sold = S.getSold(day.iso);
            return `
            <div class="planday ${day.open ? '' : 'planday--closed'} ${isToday ? 'planday--today' : ''}" data-iso="${day.iso}">
              <div class="planday__date">
                <strong>${day.weekday}${isToday ? ' · i dag' : ''}</strong>
                <small>${esc(S.formatDate(day.iso, false))}${day.open ? '' : ' · lukket'}${sold ? ` · solgt: ${sold}` : ''}</small>
              </div>
              <input class="inline-input" data-f="title" placeholder="${day.open ? 'Ret, fx Boller i karry' : 'Lukket'}" value="${esc(d.title)}" ${day.open ? '' : 'disabled'} />
              <input class="inline-input" data-f="desc" placeholder="Kort beskrivelse (valgfrit)" value="${esc(d.desc || '')}" ${day.open ? '' : 'disabled'} />
              <input class="inline-input" data-f="price" type="number" min="0" placeholder="Pris" value="${esc(d.price ?? '')}" ${day.open ? '' : 'disabled'} />
              <input class="inline-input" data-f="stock" type="number" min="0" placeholder="Antal" title="Antal portioner – lad stå tomt for ubegrænset" value="${esc(d.stock ?? '')}" ${day.open ? '' : 'disabled'} />
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
    const stockRaw = $('[data-f="stock"]', rowEl).value;
    const stock = stockRaw === '' ? null : Number(stockRaw);
    if (!title) {
      S.setDagensRet(iso, null);
      toast(`${S.formatDate(iso)}: dagens ret fjernet`);
    } else {
      S.setDagensRet(iso, { title, desc, price, stock });
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
                <select class="inline-input" data-f="availability" style="width:auto;" title="Hvilke dage serveres kategorien?">
                  <option value="alle" ${cat.availability !== 'hverdage' ? 'selected' : ''}>Alle dage</option>
                  <option value="hverdage" ${cat.availability === 'hverdage' ? 'selected' : ''}>Kun hverdage</option>
                </select>
                <button class="abtn abtn--danger abtn--icon" data-act="del-cat" title="Slet kategori">🗑</button>
              </div>
              <div class="menued__items">
                ${cat.items.map((item, ii) => `
                  <div class="menued__item menued__item--full ${item.soldout ? 'menued__item--out' : ''}" data-ii="${ii}">
                    <input class="inline-input" data-f="name" value="${esc(item.name)}" placeholder="Navn" />
                    <input class="inline-input" data-f="desc" value="${esc(item.desc || '')}" placeholder="Beskrivelse" />
                    <input class="inline-input" data-f="price" type="number" min="0" value="${esc(item.price ?? '')}" placeholder="Pris" />
                    <input class="inline-input" data-f="left" type="number" min="1" max="99" value="${esc(item.left ?? '')}" placeholder="Få tilbage?" title="Valgfrit: skriv fx 2, så viser hjemmesiden 'Kun 2 tilbage'" />
                    <button class="soldbtn ${item.soldout ? 'is-out' : ''}" data-act="toggle-soldout" data-f="soldout" data-on="${item.soldout ? 1 : 0}" title="${item.soldout ? 'Tryk for at sætte retten til salg igen' : 'Tryk, når retten er udsolgt i dag'}">${item.soldout ? 'UDSOLGT ✕' : 'Udsolgt?'}</button>
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
        availability: $('[data-f="availability"]', catEl).value,
        items: $$('.menued__item', catEl).map((itemEl) => ({
          name: $('[data-f="name"]', itemEl).value.trim(),
          desc: $('[data-f="desc"]', itemEl).value.trim(),
          price: $('[data-f="price"]', itemEl).value ? Number($('[data-f="price"]', itemEl).value) : null,
          soldout: $('[data-f="soldout"]', itemEl)?.dataset.on === '1',
          left: $('[data-f="left"]', itemEl)?.value ? Number($('[data-f="left"]', itemEl).value) : null,
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
          availability: $('[data-f="availability"]', catEl).value,
          items: $$('.menued__item', catEl).map((itemEl) => ({
            name: $('[data-f="name"]', itemEl).value,
            desc: $('[data-f="desc"]', itemEl).value,
            price: $('[data-f="price"]', itemEl).value ? Number($('[data-f="price"]', itemEl).value) : null,
            soldout: $('[data-f="soldout"]', itemEl)?.dataset.on === '1',
            left: $('[data-f="left"]', itemEl)?.value ? Number($('[data-f="left"]', itemEl).value) : null,
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

    /* "få tilbage"-feltet gemmer selv, når man har skrevet tallet */
    $('#view-menukort').onchange = (e) => {
      if (e.target.matches && e.target.matches('[data-f="left"]')) collectAndSave();
    };

    /* onclick (ikke addEventListener) så vi ikke stabler lyttere ved gen-render */
    $('#view-menukort').onclick = (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'toggle-soldout') {
        /* ét tryk markerer udsolgt OG gemmer med det samme – hurtigt midt i en travl aften */
        const on = btn.dataset.on === '1';
        btn.dataset.on = on ? '0' : '1';
        const name = $('[data-f="name"]', btn.closest('.menued__item')).value.trim() || 'Retten';
        collectAndSave();
        toast(on ? `„${name}" er til salg igen ✓` : `„${name}" er markeret UDSOLGT – kan ikke bestilles ✓`);
      } else if (act === 'add-item' || act === 'add-witem') {
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
        <div class="hoursrow" style="margin-bottom:14px;">
          <strong>🍳 Køkkenet lukker</strong>
          <span class="sub" style="color:var(--ink-soft);font-size:0.85rem;">Gælder alle dage – madbestillinger kan kun vælges frem til dette tidspunkt.</span>
          <input class="inline-input" id="kitchenClose" type="time" value="${esc(S.getSettings().kitchenClose || '20:30')}" />
          <span></span><span></span><span></span>
        </div>
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
      /* kun dag-rækkerne i .hoursgrid – køkken-rækken ovenfor har ingen kontakt */
      const newHours = $$('#view-tider .hoursgrid .hoursrow').map((row) => {
        const closed = !$('[data-f="open-toggle"]', row).checked;
        return {
          closed,
          open: closed ? '' : $('[data-f="open"]', row).value,
          close: closed ? '' : $('[data-f="close"]', row).value,
        };
      });
      S.setHours(newHours);
      S.updateSettings({ kitchenClose: $('#kitchenClose').value || '' });
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

      ${S.isCloud() ? `
      <div class="acard">
        <div class="acard__head"><h2>🔑 Login</h2></div>
        <p class="sub" style="color:var(--ink-soft);">
          Dashboardet er koblet på den fælles database – du logger ind med chefens e-mail og adgangskode.
          Adgangskoden skiftes i Supabase under <strong>Authentication → Users</strong>.
        </p>
      </div>` : `
      <div class="acard">
        <div class="acard__head"><h2>🔑 PIN-kode til admin</h2></div>
        <div class="formgrid">
          <label class="afield"><span>Ny PIN (4-8 cifre)</span><input id="setPin" inputmode="numeric" maxlength="8" placeholder="••••" /></label>
        </div>
        <button class="abtn" id="pinSave" style="margin-top:16px;">Skift PIN</button>
      </div>`}

      <div class="acard">
        <div class="acard__head"><h2>🔔 Notifikationer på denne enhed</h2></div>
        ${!pushSupported() ? `
        <p class="sub" style="color:var(--ink-soft);">Denne browser understøtter ikke notifikationer – åbn admin i Chrome på telefonen.</p>` : `
        <p class="sub" style="color:var(--ink-soft);margin-bottom:14px;">
          Status: <strong>${Notification.permission === 'granted' ? '✅ Slået til' : (Notification.permission === 'denied' ? '🚫 Blokeret i browserens indstillinger' : '⚪ Ikke slået til endnu')}</strong>
          · Telefonen får besked ved nye bestillinger, arrangement-forespørgsler og mødebookinger – også når appen er lukket.
        </p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          ${Notification.permission !== 'granted' ? '<button class="abtn abtn--green" id="pushEnableBtn">🔔 Slå notifikationer til</button>' : ''}
          ${Notification.permission === 'granted' ? '<button class="abtn abtn--ghost" id="pushTestBtn">Send en testnotifikation</button>' : ''}
        </div>`}
      </div>

      <div class="acard">
        <div class="acard__head"><h2>💾 Data</h2></div>
        <p class="sub" style="color:var(--ink-soft);margin-bottom:14px;">Download en sikkerhedskopi af alle bestillinger, bookinger og menuer${S.isCloud() ? '.' : ' – eller nulstil til demo-indholdet.'}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="abtn abtn--ghost" id="exportBtn">⬇ Download backup (JSON)</button>
          ${S.isCloud() ? '' : '<button class="abtn abtn--danger" id="resetBtn">Nulstil alle data</button>'}
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

    $('#pinSave')?.addEventListener('click', () => {
      const pin = $('#setPin').value.trim();
      if (!/^\d{4,8}$/.test(pin)) { toast('PIN skal være 4-8 cifre'); return; }
      S.updateSettings({ pin });
      $('#setPin').value = '';
      toast('PIN-koden er skiftet ✓');
    });

    $('#pushEnableBtn')?.addEventListener('click', async () => {
      await enablePush();
      renderSettings();
    });

    $('#pushTestBtn')?.addEventListener('click', async () => {
      try {
        const reg = swReg || await navigator.serviceWorker.ready;
        await reg.showNotification('🍲 Ny bestilling (test)', {
          body: 'Sådan ser det ud, når der kommer en rigtig bestilling.',
          icon: 'assets/icon-192.png',
          badge: 'assets/icon-192.png',
          vibrate: [180, 60, 180],
        });
        toast('Testnotifikation sendt – tjek notifikationsbjælken');
      } catch {
        toast('Kunne ikke vise testnotifikationen');
      }
    });

    $('#exportBtn').addEventListener('click', () => {
      const blob = new Blob([S.exportData()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `spiis-backup-${S.todayISO()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });

    $('#resetBtn')?.addEventListener('click', () => {
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

    if (act === 'save-note') {
      const iso = btn.dataset.iso;
      const ta = $(`textarea[data-note="${iso}"]`);
      S.setNote(iso, ta ? ta.value : '');
      toast(`Note gemt for ${S.formatDate(iso)} ✓`);
      return;
    }
    if (act === 'goto-orders') {
      ordersDate = btn.dataset.iso;
      $('.navitem[data-view="bestillinger"]')?.click();
      return;
    }

    if (act === 'order-toggle') {
      const o = S.getOrders().find((x) => x.id === id);
      if (o) S.updateOrder(id, { status: o.status === 'ny' ? 'haandteret' : 'ny', read: true });
    }
    else if (act === 'order-del') {
      if (!confirm('Slet denne bestilling?')) return;
      S.deleteOrder(id);
    }
    else if (act === 'booking-edit') {
      /* fold dato/tid-editoren ud i rækken – og læg kundens ønske i felterne */
      const editor = btn.closest('.row').querySelector('.bkedit');
      editor.hidden = !editor.hidden;
      if (!editor.hidden) {
        const bk = S.getBookings().find((x) => x.id === id) || {};
        const timeSel = editor.querySelector('.bkedit__time');
        if (!timeSel.options.length) {
          const opts = [];
          for (let m = 8 * 60; m <= 23 * 60 + 30; m += 30) {
            const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
            opts.push(`<option value="${t}">kl. ${t}</option>`);
          }
          timeSel.innerHTML = opts.join('');
        }
        timeSel.value = bk.time || '18:00';
        SpiisDatepicker.attach(editor.querySelector('.bkedit__date'), {
          min: S.todayISO(),
          /* prik på dage, der allerede har et aftalt arrangement */
          marker: (iso) => S.getBookings().some((x) =>
            x.id !== id && x.kind === 'arrangement' && x.status === 'bekraeftet' && x.date === iso),
        });
      }
      return;
    }
    else if (act === 'booking-save') {
      const editor = btn.closest('.bkedit');
      const date = editor.querySelector('.bkedit__date').value;
      const time = editor.querySelector('.bkedit__time').value;
      const staffNote = editor.querySelector('.bkedit__note').value.trim();
      if (!date) { toast('Vælg en dato for aftalen'); return; }
      const bk = S.getBookings().find((x) => x.id === id);
      const patch = { date, time, staff_note: staffNote, status: 'bekraeftet', read: true };
      const blockEl = editor.querySelector('.bkedit__block');
      if (blockEl) patch.block_orders = blockEl.checked;
      S.updateBooking(id, patch);
      toast(bk && bk.kind === 'arrangement'
        ? `Gemt: ${S.formatDate(date)} kl. ${time} ✓ – ${patch.block_orders ? 'dagen er lukket for andre arrangementer og madbestillinger' : 'Spiis holder åbent for bestillinger ved siden af'}`
        : `Gemt: ${S.formatDate(date)} kl. ${time} ✓`);
    }
    else if (act === 'booking-close') {
      btn.closest('.bkedit').hidden = true;
      return;
    }
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

  /* ============================================================
     LIVE-ALARM: når der tikker noget nyt ind, mens appen er åben,
     siger den selv til – toast, lyd og vibration. Push-beskederne
     dækker, når appen er lukket; det her dækker resten.
     ============================================================ */
  let liveSeen = null;

  function ping() {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      [[880, 0], [1318, 0.12]].forEach(([freq, delay]) => {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = 'sine';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.001, ac.currentTime + delay);
        g.gain.exponentialRampToValueAtTime(0.18, ac.currentTime + delay + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + 0.35);
        o.connect(g).connect(ac.destination);
        o.start(ac.currentTime + delay);
        o.stop(ac.currentTime + delay + 0.4);
      });
      setTimeout(() => ac.close().catch(() => {}), 900);
    } catch { /* lyd er ikke altid tilladt – alarmen vises stadig */ }
    try { navigator.vibrate && navigator.vibrate([160, 60, 160]); } catch { /* ignorér */ }
  }

  function liveAlerts() {
    const orders = S.getOrders();
    const bookings = S.getBookings();
    const ids = new Set([...orders.map((o) => 'o' + o.id), ...bookings.map((b) => 'b' + b.id)]);
    if (liveSeen === null) { liveSeen = ids; return; } /* første indlæsning = ikke nyt */
    const freshOrders = orders.filter((o) => !liveSeen.has('o' + o.id));
    const freshBookings = bookings.filter((b) => !liveSeen.has('b' + b.id));
    liveSeen = ids;
    if (!freshOrders.length && !freshBookings.length) return;
    const first = freshOrders.length
      ? `🍲 Ny bestilling: ${freshOrders[0].name}${freshOrders[0].time ? ' · kl. ' + freshOrders[0].time : ''}`
      : `${freshBookings[0].kind === 'moede' ? '📅 Ny mødebooking' : '🎉 Ny arrangement-forespørgsel'}: ${freshBookings[0].subject}`;
    const extra = freshOrders.length + freshBookings.length - 1;
    toast(extra > 0 ? `${first} (+${extra} mere)` : first);
    ping();
  }

  S.subscribe(() => {
    syncLoginMode();
    if (app.hidden) {
      /* skyen blev klar efter sideindlæsning, og chefen er allerede logget ind */
      if (S.isCloud() && S.hasSession()) showApp();
      return;
    }
    if (S.isCloud()) S.startAdminPolling();
    renderBell();
    renderListViews();
    liveAlerts();
  });

  /* ---------- start ---------- */
  if (isAuthed()) showApp();
})();
