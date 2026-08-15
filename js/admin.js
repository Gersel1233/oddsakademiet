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
  function toast(msg, fejl = false) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.toggle('toast--fejl', !!fejl);
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, fejl ? 7000 : 2600);
  }

  /* alt gemmes automatisk – den lille kvittering vises højst hvert 2,5 sek. */
  function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }
  let lastSavedToastAt = 0;
  function savedToast() {
    if (Date.now() - lastSavedToastAt > 2500) {
      lastSavedToastAt = Date.now();
      toast('Gemt ✓');
    }
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
        : 'Kunne ikke slå notifikationer til lige nu – prøv igen om lidt.');
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

    const tilPunkter = (samling) => [
      ...samling.orders.map((o) => {
        const lines = foodLines(o);
        const summary = lines.slice(0, 3).map((l) => `${l.qty} × ${l.name}`).join(' · ') + (lines.length > 3 ? ' · …' : '');
        return {
          icon: '🥡',
          kind: 'order', id: o.id, date: o.date,
          go: { view: 'bestillinger', date: o.date },
          title: `Ny bestilling: ${summary}`,
          sub: `${o.name} · ${S.formatDate(o.date)} kl. ${o.time} · ${o.type === 'togo' ? 'To-go' : 'Spiser her'}${o.persons ? ` · ${o.persons} pers.` : ''}`,
          at: o.createdAt,
        };
      }),
      ...samling.bookings.map((b) => ({
        icon: b.kind === 'moede' ? '📅' : '🎉',
        kind: 'booking', id: b.id, date: b.date,
        go: { view: 'bookinger' },
        title: `${b.kind === 'moede' ? 'Ny mødebooking' : 'Ny arrangement-forespørgsel'}: ${b.subject}`,
        sub: `${b.name} · ${b.date ? `${S.formatDate(b.date)}${b.time ? ` kl. ${b.time}` : ''}` : 'dato ikke fastlagt'}`,
        at: b.createdAt,
      })),
    ].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')
      || (b.at || '').localeCompare(a.at || ''));

    const items = tilPunkter(unread);
    /* Set for nylig: de er IKKE væk – de ligger her, og kan hentes
       tilbage. Nyeste øverst, for det er dem man leder efter. */
    const seteItems = tilPunkter(S.getSeenRecently())
      .sort((a, b) => (b.at || '').localeCompare(a.at || ''));

    /* samlet ét sted og grupperet pr. dag – nærmeste dag øverst */
    const today = S.todayISO();
    const groups = new Map();
    items.forEach((n) => {
      const key = n.date || '';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(n);
    });
    const dayLabel = (d) => (!d ? '📆 Dato ikke fastlagt'
      : d === today ? '🔴 I dag'
      : d === S.addDays(today, 1) ? 'I morgen'
      : S.formatDate(d, false));

    const nyeHtml = items.length
      ? [...groups.entries()].map(([d, list]) => `
          <div class="notifday">${dayLabel(d)} <em>${list.length}</em></div>
          ${list.map((n) => `
          <div class="notifrow" data-kind="${n.kind}" data-id="${esc(n.id)}">
            <button type="button" class="notif notif--unread" data-go-view="${n.go.view}" ${n.go.date ? `data-go-date="${n.go.date}"` : ''}>
              <span class="notif__icon">${n.icon}</span>
              <div class="notif__text"><strong>${esc(n.title)}</strong><small>${esc(n.sub)}</small></div>
              <span class="notif__arrow" aria-hidden="true">→</span>
            </button>
            <button type="button" class="notif__x" data-dismiss aria-label="Fjern notifikationen">✕</button>
          </div>`).join('')}`).join('')
      : '<div class="belldrop__empty">Ingen nye notifikationer 🎉</div>';

    /* ── Set for nylig ─────────────────────────────────────────
       En notifikation forsvinder ALDRIG bare. Har nogen fjernet
       den – eller trykket "✓ Færdig" – ligger den her i to døgn
       og kan sættes tilbage som ny. */
    const seteHtml = !seteItems.length ? '' : `
      <details class="notifset">
        <summary>👁 Set for nylig <em>${seteItems.length}</em> <span class="notifset__hint">· tryk for at se dem</span></summary>
        <p class="notifset__forklar">Fjernet af nogen i køkkenet, eller kørt færdig. De er ikke væk – tryk ↩ for at sætte en tilbage som ny.</p>
        ${seteItems.map((n) => `
          <div class="notifrow notifrow--set" data-kind="${n.kind}" data-id="${esc(n.id)}">
            <button type="button" class="notif" data-go-view="${n.go.view}" ${n.go.date ? `data-go-date="${n.go.date}"` : ''}>
              <span class="notif__icon">${n.icon}</span>
              <div class="notif__text"><strong>${esc(n.title)}</strong><small>${esc(n.sub)}</small></div>
              <span class="notif__arrow" aria-hidden="true">→</span>
            </button>
            <button type="button" class="notif__x notif__igen" data-undismiss title="Sæt tilbage som ny" aria-label="Sæt tilbage som ny">↩</button>
          </div>`).join('')}
      </details>`;

    $('#bellList').innerHTML = nyeHtml + seteHtml;
  }

  /* swipe en notifikation væk (telefon) – eller tryk ✕ (alle enheder).
     Notifikationerne bliver ellers HÆNGENDE, til de bevidst fjernes. */
  function dismissNotif(row) {
    /* en allerede set notifikation kan ikke fjernes igen – den ligger
       under "Set for nylig" og skal blive der */
    if (!row || row.classList.contains('notifrow--set')) return;
    row.classList.add('is-gone');
    setTimeout(() => {
      /* kom den ikke i hus i databasen, dukker den op igen med det samme
         – så man opdager det nu og ikke først i morgen tidlig */
      Promise.resolve(S.markRead(row.dataset.kind, row.dataset.id)).then(() => renderBell());
      renderBell();
    }, 180);
  }
  (function initNotifSwipe() {
    const list = $('#bellList');
    let startX = 0, row = null;
    list.addEventListener('touchstart', (e) => {
      row = e.target.closest('.notifrow');
      startX = e.touches[0].clientX;
    }, { passive: true });
    list.addEventListener('touchmove', (e) => {
      if (!row) return;
      const dx = e.touches[0].clientX - startX;
      if (dx < 0) row.style.transform = `translateX(${Math.max(dx, -140)}px)`;
    }, { passive: true });
    list.addEventListener('touchend', (e) => {
      if (!row) return;
      const dx = e.changedTouches[0].clientX - startX;
      row.style.transform = '';
      if (dx < -70) dismissNotif(row);
      row = null;
    });
    list.addEventListener('click', (e) => {
      if (e.target.closest('[data-dismiss]')) {
        e.stopPropagation();
        dismissNotif(e.target.closest('.notifrow'));
      }
      /* ↩ fortryd: hent den tilbage som ny – også hos de andre */
      const igen = e.target.closest('[data-undismiss]');
      if (igen) {
        e.stopPropagation();
        const row = igen.closest('.notifrow');
        Promise.resolve(S.markUnread(row.dataset.kind, row.dataset.id)).then(() => renderBell());
        renderBell();
        toast('Sat tilbage som ny – også på de andres skærme');
      }
    });
  })();

  /* tryk på en notifikation → hop direkte til bestillingen/bookingen,
     også når den ligger på en anden dag end i dag */
  $('#bellList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-go-view]');
    if (!btn) return;
    bellDrop.hidden = true;
    if (btn.dataset.goDate) { ordersAllDays = false; ordersDate = btn.dataset.goDate; }
    switchView(btn.dataset.goView);
  });

  /* "hvor havner alt henne?" – to knapper der altid fører til hele listen */
  $('#bellAllOrders').addEventListener('click', () => {
    bellDrop.hidden = true;
    ordersAllDays = true;
    switchView('bestillinger');
  });
  $('#bellAllBookings').addEventListener('click', () => {
    bellDrop.hidden = true;
    switchView('bookinger');
  });
  /* "hvem fjernede den, og hvornår?" – logbogen ved det */
  $('#bellHistorik').addEventListener('click', () => {
    bellDrop.hidden = true;
    visHistorik();
  });

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
    uge: 'Kalender',
    bestillinger: 'Bestillinger',
    bookinger: 'Bookinger',
    nyheder: 'Nyheder',
    dagensret: 'Dagens ret',
    menukort: 'Menukort',
    tider: 'Åbningstider',
    indstillinger: 'Indstillinger',
  };
  let activeView = 'overblik';
  const MORE_VIEWS = ['uge', 'menukort', 'nyheder', 'tider', 'indstillinger'];

  function switchView(view) {
    if (!view || !VIEW_TITLES[view]) return;
    activeView = view;
    $$('.navitem').forEach((b) => b.classList.toggle('is-active', b.dataset.view === view));
    /* "Mere"-knappen lyser, når man er inde i en af de sjældnere faner */
    $('#moreBtn')?.classList.toggle('is-active', MORE_VIEWS.includes(view));
    $$('.view').forEach((v) => { v.hidden = v.id !== `view-${view}`; });
    $('#viewTitle').textContent = VIEW_TITLES[view];
    renderView(view);
  }

  /* "Mere"-panel (telefon) */
  const moreSheet = $('#moreSheet');
  const openMore = () => { moreSheet.classList.add('is-open'); };
  const closeMore = () => { moreSheet.classList.remove('is-open'); };

  $('#sideNav').addEventListener('click', (e) => {
    if (e.target.closest('.navitem--more')) { openMore(); return; }
    const btn = e.target.closest('.navitem');
    if (btn && btn.dataset.view) switchView(btn.dataset.view);
  });
  moreSheet?.addEventListener('click', (e) => {
    const item = e.target.closest('.moreitem');
    if (item && item.dataset.view) { switchView(item.dataset.view); closeMore(); return; }
    if (e.target === moreSheet) closeMore(); /* tryk uden for panelet lukker */
  });

  function renderView(view) {
    const renderers = {
      overblik: renderOverblik,
      uge: renderUge,
      bestillinger: renderBestillinger,
      bookinger: renderBookinger,
      nyheder: renderNyheder,
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
  /* emballage-/genbrugslinjer er ikke mad – de tælles og produceres ikke */
  const isExtraLine = (l) => l.kind === 'emballage' || l.kind === 'genbrug';
  const foodLines = (o) => orderLines(o).filter((l) => !isExtraLine(l));
  const personsOf = (o) => (o.persons != null ? Number(o.persons) : Number(o.qty || 0));
  const itemsOf = (o) => foodLines(o).reduce((s, l) => s + Number(l.qty), 0);

  /* læg alle bestilte retter sammen pr. navn (til produktionslisten) */
  function dishTotals(orders) {
    const map = new Map();
    orders.forEach((o) => foodLines(o).forEach((l) => {
      map.set(l.name, (map.get(l.name) || 0) + Number(l.qty));
    }));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }

  /* samme, men delt op i to-go / spiser her pr. ret */
  function dishTotalsSplit(orders) {
    const map = new Map();
    orders.forEach((o) => foodLines(o).forEach((l) => {
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
    /* forløbet viser kun aktive bestillinger – ALLE dagens bookinger
       (arrangementer OG møder) står samlet i sektionen ovenover */
    const entries = S.getOrders(iso)
      .filter((o) => o.status === 'ny')
      .map((o) => ({ time: o.time || '', kind: 'order', o }));
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

  /* rækker hvor "⋯" er foldet ud – så en automatisk opdatering ikke
     lukker panelet, mens man står med fingeren på skærmen */
  const aabneRaekker = new Set();

  /* ============================================================
     BEKRÆFTELSE DER IKKE KAN TRYKKES VÆK VED ET UHELD
     Browserens egen confirm() kan besejres af en hurtig dobbelt-
     berøring: dialogen når at komme frem, og det tryk man allerede
     var i gang med lander på "OK". Logbogen viste præcis det –
     sletningen kom ét sekund efter det foregående tryk.
     Her er slette-knappen SLUKKET de første 1,2 sekunder, og den
     sikre knap er den store. Så kan et fejltryk ikke nå den.
     ============================================================ */
  function bekraeftFarligt({ titel, linjer = [], knap = '🗑 Slet endeligt', note = '' }) {
    return new Promise((svar) => {
      const mask = document.createElement('div');
      mask.className = 'dvmask farligmask';
      mask.innerHTML = `
        <div class="farlig" role="alertdialog" aria-modal="true">
          <h3 class="farlig__titel">${esc(titel)}</h3>
          ${linjer.length ? `<div class="farlig__hvad">${linjer.map((l) => `<span>${esc(l)}</span>`).join('')}</div>` : ''}
          ${note ? `<p class="farlig__note">${esc(note)}</p>` : ''}
          <div class="farlig__knapper">
            <button type="button" class="abtn abtn--accent farlig__nej">Behold</button>
            <button type="button" class="abtn abtn--danger farlig__ja" disabled>Vent…</button>
          </div>
        </div>`;
      document.body.appendChild(mask);
      document.body.classList.add('dv-open');
      const ja = mask.querySelector('.farlig__ja');
      const nej = mask.querySelector('.farlig__nej');
      nej.focus();

      /* knappen vågner først efter 1,2 sek. – med synlig nedtælling */
      let tilbage = 12;
      const tik = setInterval(() => {
        tilbage -= 1;
        if (tilbage > 0) { ja.textContent = `Vent… ${(tilbage / 10).toFixed(1)}`; return; }
        clearInterval(tik);
        ja.disabled = false;
        ja.textContent = knap;
      }, 100);

      const luk = (v) => {
        clearInterval(tik);
        mask.remove();
        document.body.classList.remove('dv-open');
        document.removeEventListener('keydown', tast);
        svar(v);
      };
      const tast = (e) => { if (e.key === 'Escape') luk(false); };
      document.addEventListener('keydown', tast);
      nej.addEventListener('click', () => luk(false));
      ja.addEventListener('click', () => { if (!ja.disabled) luk(true); });
      mask.addEventListener('click', (e) => { if (e.target === mask) luk(false); });
    });
  }

  /* ============================================================
     HISTORIK — "hvor blev den bestilling af?"
     Der findes ingen skraldespand: sletter man en bestilling, er den
     væk fra databasen med det samme. Men databasen skriver ned, hvad
     der sker, og hvem der gjorde det. Her kan personalet selv slå op,
     i stedet for at gætte på om en bestilling nogensinde kom ind.
     ============================================================ */
  function logTid(iso) {
    const d = new Date(iso);
    const dag = d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
    const kl = d.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
    const minSiden = Math.round((Date.now() - d.getTime()) / 60000);
    let siden = '';
    if (minSiden < 1) siden = 'lige nu';
    else if (minSiden < 60) siden = `for ${minSiden} min. siden`;
    else if (minSiden < 60 * 24) siden = `for ${Math.round(minSiden / 60)} time(r) siden`;
    return { naar: `${dag} kl. ${kl}`, siden };
  }

  /* Hvem gjorde det – oversat fra databasesprog til dansk */
  function logHvem(r) {
    const mail = r.af_hvem && r.af_hvem !== '(ingen)' ? r.af_hvem : '';
    if (r.rolle === 'anon') return 'kunden selv (fra hjemmesiden)';
    if (mail) return mail;
    if (r.rolle === 'authenticated') return 'personalet';
    return 'direkte i databasen';
  }

  const LOG_TEKST = {
    oprettet: { ikon: '🆕', ord: 'kom ind', klasse: 'logrow--ny' },
    'ændret': { ikon: '✏️', ord: 'blev rettet', klasse: '' },
    SLETTET: { ikon: '🗑', ord: 'blev SLETTET', klasse: 'logrow--slettet' },
  };

  async function visHistorik() {
    const mask = document.createElement('div');
    mask.className = 'dvmask logmask';
    mask.innerHTML = `
      <div class="logbox" role="dialog" aria-modal="true" aria-label="Historik">
        <div class="logbox__head">
          <h3>🕓 Historik</h3>
          <button type="button" class="abtn abtn--ghost logbox__luk" aria-label="Luk">✕</button>
        </div>
        <p class="logbox__sub">Alt hvad der er sket med bestillinger – også dem der er slettet. En slettet bestilling kan ikke hentes tilbage, men her kan man se hvad der stod i den, og hvem der slettede den.</p>
        <div class="logbox__krop"><div class="empty">Henter …</div></div>
      </div>`;
    document.body.appendChild(mask);
    document.body.classList.add('dv-open');
    const luk = () => {
      mask.remove();
      document.body.classList.remove('dv-open');
      document.removeEventListener('keydown', tast);
    };
    const tast = (e) => { if (e.key === 'Escape') luk(); };
    document.addEventListener('keydown', tast);
    mask.querySelector('.logbox__luk').addEventListener('click', luk);
    mask.addEventListener('click', (e) => { if (e.target === mask) luk(); });

    const krop = mask.querySelector('.logbox__krop');
    const svar = await S.getOrderHistory(200);
    if (!svar.ok) {
      const besked = {
        'ingen-logbog': 'Logbogen er ikke slået til endnu. Kør <code>logbog.sql</code> i Supabase, så gemmes alt fra da af.',
        'ikke-logget-ind': 'Log ind igen for at se historikken.',
        net: 'Kunne ikke hente historikken – tjek forbindelsen og prøv igen.',
        fejl: 'Kunne ikke hente historikken – prøv igen om lidt.',
      }[svar.grund] || 'Kunne ikke hente historikken.';
      krop.innerHTML = `<div class="empty">${besked}</div>`;
      return;
    }
    if (!svar.rows.length) {
      krop.innerHTML = '<div class="empty">Der er ikke sket noget endnu.</div>';
      return;
    }
    krop.innerHTML = `<div class="rowlist">${svar.rows.map((r) => {
      const t = LOG_TEKST[r.handling] || { ikon: '•', ord: r.handling, klasse: '' };
      const { naar, siden } = logTid(r.hvornaar);
      return `
        <div class="logrow ${t.klasse}">
          <span class="logrow__hvad">${t.ikon} ${esc(r.kunde || 'uden navn')} — ${t.ord}</span>
          <span class="logrow__tid">${esc(naar)}${siden ? ` · ${esc(siden)}` : ''}</span>
          <span class="logrow__mad">${esc(r.varer || 'ingen varer')}</span>
          <span class="logrow__naar">📅 ${r.dato ? esc(S.formatDate(r.dato, false)) : '?'} kl. ${esc(r.klokken || '–')}</span>
          <span class="logrow__hvem">👤 ${esc(logHvem(r))}</span>
        </div>`;
    }).join('')}</div>`;
  }

  function orderRow(o, showDate = false) {
    const all = orderLines(o).filter((l) => !isExtraLine(l));
    const extras = orderLines(o).filter(isExtraLine);
    const reuse = extras.find((l) => l.kind === 'genbrug');
    const pack = extras.find((l) => l.kind === 'emballage');
    const drinks = drinkNameSet();
    const isDrink = (l) => (l.cat ? /drik/i.test(l.cat) : drinks.has(l.name));
    const food = all.filter((l) => !isDrink(l));
    const drink = all.filter(isDrink);
    const li = (l) => `<li><b>${l.qty} ×</b> ${esc(l.name)}${l.kind === 'dagensret' ? '<span class="tag tag--accent">Dagens ret</span>' : ''}${l.kind === 'nyhed' ? '<span class="tag tag--ink">📣 Nyhed</span>' : ''}</li>`;
    const done = o.status !== 'ny';
    return `
      <div class="row ${done ? 'row--done' : 'row--new'}">
        <div class="row__main">
          <div class="row__title">${esc(o.name)}
            ${personsOf(o) ? `<span class="tag">👥 ${personsOf(o)} pers.</span>` : ''}
            <span class="tag ${o.type === 'togo' ? 'tag--accent' : 'tag--ink'}">${o.type === 'togo' ? '🥡 To-go' : '🍽️ Spiser her'}</span>
            ${all.some((l) => l.kind === 'tapas') ? '<span class="tag tag--accent">🧀 Tapas</span>' : ''}
            ${o.type !== 'togo' && itemsOf(o) > 0 && personsOf(o) > itemsOf(o) ? `<span class="tag tag--wait">⚠️ ${personsOf(o)} pers. – mad til ${itemsOf(o)}</span>` : ''}
            ${done ? '' : '<span class="tag tag--red">Ny</span>'}
          </div>
          ${food.length ? `<ul class="olist">${food.map(li).join('')}</ul>` : ''}
          ${drink.length ? `<div class="olist__sep"></div><ul class="olist olist--drinks">${drink.map(li).join('')}</ul>` : ''}
          ${reuse ? '<div class="packline packline--reuse">♻️ Tager selv emballage med til dagens ret – emballagen er gratis</div>' : ''}
          ${pack ? `<div class="packline">📦 Emballage: ${pack.qty} stk. (${pack.qty * Number(pack.price || 0)} kr.)</div>` : ''}
          <div class="row__sub">
            ${showDate ? `${esc(S.formatDate(o.date))} · ` : ''}${o.time ? `kl. ${esc(o.time)} · ` : ''}📞 ${esc(o.phone)}
            ${o.note ? ` · 💬 ${esc(o.note)}` : ''}
          </div>
        </div>
        <div class="row__actions">
          ${done
            ? `<button class="abtn abtn--ghost" data-act="order-toggle" data-id="${o.id}" title="Fortryd – læg bestillingen tilbage på listen">↩ Gendan</button>`
            : `<button class="abtn abtn--green" data-act="order-toggle" data-id="${o.id}">✓ Færdig</button>`}
          <!-- Slet ligger IKKE ved siden af "Færdig". Den knap trykkes
               hundrede gange om dagen på en telefon, og et fejltryk på
               en skraldespand ved siden af koster en rigtig bestilling. -->
          <button class="abtn abtn--ghost abtn--icon" data-act="row-more" aria-label="Flere valg" title="Flere valg">⋯</button>
        </div>
        <div class="row__danger" ${aabneRaekker.has(o.id) ? '' : 'hidden'}>
          <span>Bestillingen forsvinder for altid – køkkenet kan ikke få den tilbage.</span>
          <button class="abtn abtn--danger" data-act="order-del" data-id="${o.id}">🗑 Slet bestillingen</button>
        </div>
      </div>`;
  }

  /* færdige bestillinger ligger i et foldet arkiv til dagen er omme */
  function doneFold(doneOrders) {
    if (!doneOrders.length) return '';
    return `
      <details class="donefold">
        <summary>✓ Færdige (${doneOrders.length}) <em>· tryk for at se – gendan hvis noget var en fejl</em></summary>
        <div class="rowlist" style="margin-top:10px;">${doneOrders.map((o) => orderRow(o)).join('')}</div>
      </details>`;
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
          ${b.status === 'afvist'
            ? `<button class="abtn abtn--green" data-act="booking-restore" data-id="${b.id}" title="Fortryd – læg den tilbage under 'Venter på jer'">↩ Gendan</button>`
            : `<button class="abtn ${b.status === 'bekraeftet' ? 'abtn--ghost' : 'abtn--green'}" data-act="booking-edit" data-id="${b.id}">${b.status === 'bekraeftet' ? '🖉 Ret / notér' : (isMoede ? '✓ Bekræft & sæt tid' : '✓ Aftal & sæt tid')}</button>
               <button class="abtn abtn--ghost" data-act="booking-no" data-id="${b.id}">Afvis</button>`}
          <button class="abtn abtn--ghost abtn--icon" data-act="row-more" aria-label="Flere valg" title="Flere valg">⋯</button>
        </div>
        <div class="row__danger" ${aabneRaekker.has(b.id) ? '' : 'hidden'}>
          <span>Bookingen forsvinder for altid – I kan ikke få den tilbage.</span>
          <button class="abtn abtn--danger" data-act="booking-del" data-id="${b.id}">🗑 Slet bookingen</button>
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
    /* ALLE dagens bookinger – arrangementer OG møder – så intet kan gemme sig */
    const todaysArrangements = S.getBookings()
      .filter((b) => b.date === today && b.status !== 'afvist')
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    /* dagens bookinger står i køreplanen – her vises kun et kort overblik */
    const waitingCount = S.getBookings().filter((b) => b.status === 'ny').length;
    const nextUp = S.getBookings()
      .filter((b) => b.status === 'bekraeftet' && b.date && b.date > today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 3);
    const newBookings = waitingCount;

    /* ============================================================
       LIGE MODTAGET
       Når telefonen siger pling, leder man efter DEN bestilling – ikke
       efter en bestemt dag. Bestillinger til i morgen eller næste uge
       stod før kun på deres egen dato, så de var usynlige på forsiden.
       Her ligger alt, der er tikket ind det seneste døgn, uanset
       hvilken dag maden skal hentes.
       ============================================================ */
    const etDøgn = 24 * 3600e3;
    const nyligt = S.getOrders()
      .filter((o) => o.createdAt && (Date.now() - new Date(o.createdAt).getTime()) < etDøgn)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const siden = (iso) => {
      const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
      if (min < 1) return 'lige nu';
      if (min < 60) return `for ${min} min. siden`;
      const t = Math.round(min / 60);
      return `for ${t} time${t === 1 ? '' : 'r'} siden`;
    };
    /* Er der intet nyt, må kortet ikke stjæle en halv telefonskærm.
       Så skrumper det til én stille linje. */
    const nyligtHtml = !nyligt.length ? `
      <div class="acard nyecard nyecard--tom">
        <span>🆕 <strong>Lige modtaget</strong> · ingen nye bestillinger det seneste døgn</span>
      </div>`
      : `
      <div class="acard nyecard">
        <div class="acard__head">
          <h2>🆕 Lige modtaget</h2>
          <span class="sub">tikket ind det seneste døgn – uanset hvilken dag maden skal hentes</span>
        </div>
        ${nyligt.length ? `
        <div class="rowlist">
          ${nyligt.map((o) => `
            <button type="button" class="nyrow ${o.status === 'ny' ? 'nyrow--ny' : ''}" data-act="goto-orders" data-iso="${o.date}">
              <span class="nyrow__tid">${esc(siden(o.createdAt))}</span>
              <span class="nyrow__navn">${esc(o.name)}${o.status === 'ny' ? '<b class="nyrow__prik">Ny</b>' : ' <em>✓ kørt</em>'}</span>
              <span class="nyrow__mad">${esc(foodLines(o).map((l) => `${l.qty} × ${l.name}`).join(' · ') || 'ingen varer')}</span>
              <span class="nyrow__hvornaar">📅 <strong>${esc(S.formatDate(o.date, false))}</strong> kl. ${esc(o.time || '–')} · ${o.type === 'togo' ? '🥡 To-go' : '🍽️ Spiser her'}</span>
              <span class="nyrow__gaa">Åbn dagen →</span>
            </button>`).join('')}
        </div>`
        : '<div class="empty">Ingen nye bestillinger det seneste døgn.</div>'}
      </div>`;

    $('#view-overblik').innerHTML = `
      ${nyligtHtml}
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
        <div class="kalpanel__status ${dayStatus(today).cls}">${dayStatus(today).full}</div>

        <div class="kpnote">
          <label class="kpnote__lbl" for="kpNote">📝 Note til i dag <em>fx "Henning kommer og spiser med sin kone kl. 18"</em></label>
          <textarea id="kpNote" class="inline-input kpnote__input" data-note="${today}" rows="2" placeholder="Skriv en hurtig besked til dagen – gemmes automatisk og står også i kalenderen">${esc(S.getNote(today))}</textarea>
        </div>

        ${todaysArrangements.length ? `
        <h3 class="kp__sub">🎉 Dagens arrangementer &amp; aftaler</h3>
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
        ${doneFold(orders.filter((o) => o.status !== 'ny'))}
      </div>

      <div class="acard">
        <div class="acard__head">
          <h2>🍲 Dagens ret i dag</h2>
          <button class="abtn abtn--ghost" data-goto="dagensret">Redigér ugeplan →</button>
        </div>
        ${(() => {
          const ds = S.getDagensRetList(today);
          if (!ds.length) return '<div class="empty">Der er ikke sat en dagens ret i dag. Gå til "Dagens ret" og planlæg den.</div>';
          return ds.map((dd) => {
            const s = S.getSoldFor(today, dd.title);
            return `<div class="row"><div class="row__main">
               <div class="row__title">${esc(dd.title)}
                 ${dd.price ? `<span class="tag tag--accent">${kr(dd.price)}</span>` : ''}
                 ${dd.soldout ? '<span class="tag tag--red">🚫 Udsolgt</span>' : ''}
                 ${!dd.soldout && dd.stock != null && dd.stock !== '' ? `<span class="tag ${s >= dd.stock ? 'tag--red' : 'tag--green'}">${s}/${dd.stock} solgt</span>` : (s ? `<span class="tag">${s} solgt</span>` : '')}
               </div>
               <div class="row__sub">${esc(dd.desc || '')}</div>
             </div></div>`;
          }).join('');
        })()}
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

    /* dagsnoten gemmer sig selv, mens der skrives – præcis samme note som i
       kalenderen, så en hurtig besked ("Henning kommer kl. 18") altid ses her */
    const kpNote = $('#kpNote');
    if (kpNote) {
      let noteTimer;
      kpNote.addEventListener('input', () => {
        clearTimeout(noteTimer);
        noteTimer = setTimeout(() => { S.setNote(today, kpNote.value); savedToast(); }, 900);
      });
    }
  }

  /* ============================================================
     KALENDER – måned på desktop, uge på mobil, skriv direkte i dagene
     ============================================================ */
  let ugeStart = S.weekStart(S.todayISO());
  let kalMode = (window.matchMedia && window.matchMedia('(min-width: 980px)').matches) ? 'maaned' : 'uge';
  let kalMonth = S.todayISO().slice(0, 7);
  let kalSelected = S.todayISO();

  function kalAddMonths(ym, delta) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  /* 5-6 hele uger (man-søn), der dækker måneden */
  function kalGridDays(ym) {
    const start = S.weekStart(ym + '-01');
    const days = [];
    for (let i = 0; i < 42; i++) days.push(S.addDays(start, i));
    if (days.slice(35).every((d) => d.slice(0, 7) !== ym)) days.length = 35;
    return days;
  }

  function kalDayInfo(iso) {
    const orders = S.getOrders(iso);
    const persons = orders.reduce((s, o) => s + personsOf(o), 0);
    const togo = orders.filter((o) => o.type === 'togo').reduce((s, o) => s + personsOf(o), 0);
    return {
      orders,
      items: orders.reduce((s, o) => s + itemsOf(o), 0),
      persons, togo, spise: persons - togo,
      bookings: S.getBookings().filter((b) => b.date === iso && b.status !== 'afvist')
        .sort((a, b) => (a.time || '').localeCompare(b.time || '')),
      dish: S.getDagensRet(iso), dishes: S.getDagensRetList(iso),
      sold: S.getSold(iso), note: S.getNote(iso),
      closed: !S.isOpenDay(iso), noOrders: S.isOrderingClosed(iso),
    };
  }

  /* ÉN fælles "hvad sker der på dagen"-beregning, så kalender, dagspanel,
     uge-visning og køreplan altid siger præcis det samme.
       grøn  = åbent for madbestillinger (evt. med arrangement ved siden af)
       gul   = kun arrangement – lukket for andre bestillinger
       rød   = helt lukket ·  blå = ferie ·  grå = køkkenet holder lukket */
  function dayStatus(iso) {
    if (!S.isOpenDay(iso))
      return { key: 'kitchen', cls: 'ds--kitchen', short: 'Køkken lukket', full: '🌙 Køkkenet holder lukket denne dag' };
    /* har dagen sin egen forklaring (personaledag, privat fest …), vises DEN
       – i stedet for at alt lukket ligner ferie */
    const mark = S.getDayMark(iso);
    if (mark && (S.getBlockedDates().includes(iso) || S.isInClosure(iso)))
      return { key: 'blocked', cls: mark.e === '🌴' ? 'ds--ferie' : 'ds--blocked',
        short: `${mark.e} ${mark.t}`, full: `${mark.e} ${mark.t} – lukket for bestilling og booking` };
    if (S.isInClosure(iso))
      return { key: 'ferie', cls: 'ds--ferie', short: '🌴 Ferie', full: '🌴 Ferielukket – ingen madbestillinger (booking & kontakt er åben)' };
    if (S.getBlockedDates().includes(iso))
      return { key: 'blocked', cls: 'ds--blocked', short: '🚫 Lukket', full: '🚫 Lukket dag – hverken booking eller madbestilling' };
    const hasArr = S.getBookings().some((b) =>
      b.date === iso && b.kind === 'arrangement' && b.status === 'bekraeftet');
    const noOrders = S.isOrderingClosed(iso);
    if (hasArr && noOrders)
      return { key: 'arr-closed', cls: 'ds--arr-closed', short: '🎉 Kun arrangement', full: '🎉 Arrangement · lukket for andre madbestillinger' };
    if (hasArr)
      return { key: 'arr-open', cls: 'ds--arr-open', short: '🎉 Åbent + fest', full: '🎉 Arrangement · Spiis holder ÅBENT for bestillinger ved siden af' };
    if (noOrders)
      return { key: 'closed', cls: 'ds--blocked', short: '🚫 Lukket for mad', full: '🚫 Lukket for madbestillinger denne dag' };
    return { key: 'open', cls: 'ds--open', short: '✅ Åbent', full: '✅ Åbent for madbestillinger' };
  }

  /* lille forklaring, så farverne taler for sig selv */
  function kalLegend() {
    const items = [
      ['ds--open', '✅ Åbent'],
      ['ds--arr-open', '🎉 Arrangement · åbent'],
      ['ds--arr-closed', '🎉 Kun arrangement'],
      ['ds--blocked', '🚫 Lukket'],
      ['ds--ferie', '🌴 Ferie'],
    ];
    return `<div class="kallegend">${items.map(([c, t]) =>
      `<span class="kallegend__item"><i class="ds-dot ${c}"></i>${t}</span>`).join('')}</div>`;
  }

  /* knap til at lukke/åbne EN enkelt dag direkte fra kalenderen.
     Tom for fortidige dage, ugedage der er lukket, og ferie-dage
     (de styres i Åbningstider). Blokerer/åbner både bestilling OG booking. */
  function dayCloseBtn(iso, today) {
    if (iso < today || !S.isOpenDay(iso) || S.isInClosure(iso)) return '';
    if (S.getBlockedDates().includes(iso))
      return `<button class="abtn abtn--green" data-act="kal-unblock" data-iso="${iso}">✅ Åbn dagen igen</button>`;
    /* er der ALLEREDE lukket for madbestillinger (arrangementets flueben),
       skal det stå her – lige dér hvor man ellers ville lukke dagen */
    const note = S.isOrderingClosed(iso)
      ? '<span class="kalpanel__hint kalpanel__hint--closed">🚫 Der er allerede lukket for madbestillinger – det styres af arrangementet (ret eller afvis det for at åbne igen).</span>'
      : '';
    return `${note}<button class="abtn abtn--ghost" data-act="kal-block" data-iso="${iso}">🚫 Luk ${S.isOrderingClosed(iso) ? 'OGSÅ for booking' : 'dagen for bestilling &amp; booking'}</button>`;
  }

  /* fælles top: uge/måned-skifter + pile, der VIRKER begge veje */
  function kalHeader(title, sub) {
    return `
      <div class="acard">
        <div class="acard__head kalhead">
          <h2>📆 ${title}</h2>
          <div class="kalhead__nav">
            <div class="kaltoggle">
              <button class="${kalMode === 'uge' ? 'is-on' : ''}" data-kal="mode-uge">Uge</button>
              <button class="${kalMode === 'maaned' ? 'is-on' : ''}" data-kal="mode-maaned">Måned</button>
            </div>
            <button class="abtn abtn--ghost" data-kal="prev" title="${kalMode === 'maaned' ? 'Forrige måned' : 'Forrige uge'}">←</button>
            <button class="abtn" data-kal="today">I dag</button>
            <button class="abtn abtn--ghost" data-kal="next" title="${kalMode === 'maaned' ? 'Næste måned' : 'Næste uge'}">→</button>
            <button class="abtn abtn--ghost" data-kal="lukdage" title="Luk en dag, flere dage eller en hel ferie på én gang">🚫 Luk dage</button>
          </div>
        </div>
        <p class="sub" style="color:var(--ink-soft);">${sub}</p>
        ${kalLegend()}
      </div>`;
  }

  /* første linje af en note, kort nok til at stå i en kalender-celle */
  function noteSnip(t, max = 34) {
    const line = String(t || '').split('\n').map((s) => s.trim()).find(Boolean) || '';
    return line.length > max ? line.slice(0, max - 1) + '…' : line;
  }

  function kalCell(iso, today) {
    const inMonth = iso.slice(0, 7) === kalMonth;
    const d = kalDayInfo(iso);
    const st = dayStatus(iso);
    const cls = ['kalcell', `kalcell--st-${st.key}`,
      inMonth ? '' : 'kalcell--out',
      iso === today ? 'kalcell--today' : '',
      iso === kalSelected ? 'kalcell--sel' : '',
      d.closed ? 'kalcell--closed' : ''].filter(Boolean).join(' ');
    /* almindelige åbne dage holdes rene – kun de særlige dage får et statusmærke */
    const showPill = st.key !== 'open' && st.key !== 'kitchen';
    return `
      <button class="${cls}" data-kal="day" data-iso="${iso}">
        <span class="kalcell__num">${Number(iso.slice(8))}</span>
        ${d.closed ? '<span class="kalcell__closed">Køkken lukket</span>' : `
          ${showPill ? `<span class="kalcell__status ${st.cls}">${st.short}</span>` : ''}
          ${d.dishes.length ? `<span class="kalcell__dish" title="${esc(d.dishes.map((x) => x.title).join(' eller '))}">🍲 ${esc(d.dishes[0].title)}</span>
          ${d.dishes.length > 1 ? `<span class="kalcell__flere">+ ${d.dishes.length - 1} ret${d.dishes.length > 2 ? 'ter' : ''} mere</span>` : ''}` : ''}
          ${d.items ? `<span class="kalcell__count"><b>${d.items}</b> retter · 🥡 ${d.togo} · 🍽️ ${d.spise}</span>` : ''}`}
        ${d.bookings.some((b) => b.status === 'ny') ? '<span class="kalcell__ny">⚠️ Ny booking – svar</span>' : ''}
        ${d.note ? `<span class="kalcell__note" title="${esc(d.note)}">📝 ${esc(noteSnip(d.note))}</span>` : ''}
        ${d.bookings.slice(0, 2).map((b) => `<span class="kalcell__bk ${b.kind === 'moede' ? 'kalcell__bk--moede' : ''}">${b.kind === 'moede' ? '📅' : '🎉'} ${esc(b.subject)}</span>`).join('')}
        ${d.bookings.length > 2 ? `<span class="kalcell__more">+ ${d.bookings.length - 2} mere</span>` : ''}
      </button>`;
  }

  /* ============================================================
     DAG-VINDUET – tryk på en dag åbner den STORT oven på det hele:
     stor note-editor der gemmer af sig selv (med synligt "Gemt ✓"),
     dagens aftaler med alle knapper, dagens retter og bestillinger.
     ← / → bladrer mellem dagene uden at lukke vinduet.
     ============================================================ */
  let dvIso = null;          /* dagen der er åben lige nu – null = lukket */
  let dvNoteTimer = null;
  let dvNoteDirty = false;

  function dvFlushNote() {
    const ta = document.getElementById('dvNote');
    if (!ta || !dvNoteDirty || !dvIso) return;
    clearTimeout(dvNoteTimer);
    S.setNote(dvIso, ta.value);
    dvNoteDirty = false;
    const ind = document.getElementById('dvSave');
    if (ind) { ind.textContent = 'Gemt ✓'; ind.classList.add('is-saved'); }
  }

  function closeDayModal() {
    if (!document.getElementById('dvMask')) return;
    dvFlushNote();
    dvIso = null;
    document.getElementById('dvMask').remove();
    document.body.classList.remove('dv-open');
  }

  /* uge-strippen øverst i dag-vinduet – som i en rigtig kalender-app:
     tryk på en dag og hop direkte derhen. Prikker viser hvad der sker. */
  function dvStripHtml(iso, today) {
    const ws = S.weekStart(iso);
    let out = '';
    for (let i = 0; i < 7; i++) {
      const d2 = S.addDays(ws, i);
      const bks = S.getBookings().filter((b) => b.date === d2 && b.status !== 'afvist');
      const hasNy = bks.some((b) => b.status === 'ny');
      const dots = [
        hasNy ? '<i class="dvdot dvdot--ny"></i>' : (bks.length ? '<i class="dvdot dvdot--bk"></i>' : ''),
        S.getOrders(d2).length ? '<i class="dvdot dvdot--o"></i>' : '',
        (S.getNote(d2) || '').trim() ? '<i class="dvdot dvdot--n"></i>' : '',
      ].join('');
      out += `
        <button class="dv__stripday ${d2 === iso ? 'is-sel' : ''} ${d2 === today ? 'is-today' : ''}" data-dv-day="${d2}">
          <span class="dv__stripwd">${S.WEEKDAYS[i].slice(0, 3)}</span>
          <span class="dv__stripnum">${Number(d2.slice(8))}</span>
          <span class="dv__stripdots">${dots}</span>
        </button>`;
    }
    return `<div class="dv__strip">${out}</div>`;
  }

  /* dagens program: åbningstider, aftaler og bestillinger i ÉN tidslinje */
  function dvTimelineHtml(iso, d, st) {
    const rows = [];
    /* køkkenets tider som små mærker – kun når dagen reelt er åben for mad */
    if (st.key === 'open' || st.key === 'arr-open') {
      const s = S.getSettings();
      const from = s.orderFrom || '16:00';
      const toTogo = S.orderToFor('togo');
      const toDine = S.orderToFor('spise');
      rows.push({ t: from, sort: from + 'A', html: `<div class="dvtl__mark">🔓 Køkkenet åbner for bestillinger</div>` });
      rows.push({ t: toTogo, sort: toTogo + 'Z', html: `<div class="dvtl__mark">🥡 Sidste to-go-tid</div>` });
      if (toDine !== toTogo) rows.push({ t: toDine, sort: toDine + 'Z', html: `<div class="dvtl__mark">🍽️ Køkkenet lukker – sidste spis her-tid</div>` });
    }
    /* aftaler med ALLE knapper – tidløse ligger øverst som "hele dagen" */
    d.bookings.forEach((b) => {
      rows.push({ t: b.time || 'dag', sort: (b.time || '00:00') + 'B', html: bookingRow(b) });
    });
    /* bestillinger på deres afhentnings-/spisetid – tryk åbner Bestillinger */
    d.orders.forEach((o) => {
      const lines = foodLines(o);
      const sum = lines.slice(0, 2).map((l) => `${l.qty} × ${esc(l.name)}`).join(' · ')
        + (lines.length > 2 ? ` · +${lines.length - 2} mere` : '');
      rows.push({ t: o.time || '–', sort: (o.time || '00:00') + 'C', html: `
        <button class="dvtl__order ${o.status === 'ny' ? 'dvtl__order--ny' : 'dvtl__order--ok'}" data-act="goto-orders" data-iso="${iso}" title="Åbn dagens bestillinger">
          <span class="dvtl__otitle">${o.type === 'togo' ? '🥡' : '🍽️'} ${esc(o.name)}${o.type !== 'togo' && personsOf(o) ? ` · ${personsOf(o)} pers.` : ''}</span>
          <span class="dvtl__osub">${sum || '—'}</span>
          <span class="dvtl__ostatus">${o.status === 'ny' ? '🔥 Mangler' : '✓ Kørt'}</span>
        </button>` });
    });
    rows.sort((a, b) => a.sort.localeCompare(b.sort));
    if (!d.bookings.length && !d.orders.length) {
      rows.push({ t: '', sort: '99', html: `<div class="kalpanel__none">${d.noOrders && st.key !== 'arr-closed' ? '🚫 Dagen er lukket for madbestillinger' : 'Ingen aftaler eller bestillinger på dagen endnu'}</div>` });
    }
    return `<div class="dvtl">${rows.map((r) => `
      <div class="dvtl__row">
        <span class="dvtl__time">${r.t === 'dag' ? 'hele<br/>dagen' : esc(r.t)}</span>
        <div class="dvtl__content">${r.html}</div>
      </div>`).join('')}</div>`;
  }

  function dvBodyHtml(iso, today) {
    const d = kalDayInfo(iso);
    const st = dayStatus(iso);
    const nyCount = d.bookings.filter((b) => b.status === 'ny').length;
    /* handling til dagen: opret booking, luk/åbn – eller hop hen hvor det styres */
    let act = '';
    if (iso >= today) {
      if (!S.isOpenDay(iso)) act = `<span class="kalpanel__hint">🌙 Køkkenet er lukket på denne ugedag.</span><button class="abtn abtn--ghost" data-goto="tider">Redigér åbningstider →</button>`;
      else if (S.isInClosure(iso)) act = `<span class="kalpanel__hint">🌴 Dagen er en del af en ferieperiode.</span><button class="abtn abtn--ghost" data-goto="tider">Redigér ferie →</button>`;
      else act = `<button class="abtn abtn--accent" data-act="kal-newbooking" data-iso="${iso}">➕ Opret booking denne dag</button>${dayCloseBtn(iso, today)}<button class="abtn abtn--ghost" data-act="kal-lukdage" data-iso="${iso}" title="Luk flere dage eller en hel ferie på én gang">🌴 Luk flere dage…</button>`;
    }
    return `
      <div class="dv__status ${st.cls}">${st.full}</div>
      ${nyCount ? `<div class="dv__alert">⚠️ ${nyCount === 1 ? 'Én booking venter' : `${nyCount} bookinger venter`} på jeres svar – den ligger i programmet herunder</div>` : ''}
      ${act ? `<div class="dv__act">${act}</div>` : ''}
      <div class="dv__chips">
        <span class="dvchip">🧾 <b>${d.orders.length}</b> bestillinger</span>
        <span class="dvchip">🍲 <b>${d.items}</b> retter</span>
        <span class="dvchip">🥡 <b>${d.togo}</b> · 🍽️ <b>${d.spise}</b></span>
        ${d.bookings.length ? `<span class="dvchip">🎉 <b>${d.bookings.length}</b> aftale${d.bookings.length === 1 ? '' : 'r'}</span>` : ''}
      </div>
      <div class="dv__notewrap">
        <div class="dv__notehead">
          <h3 class="kp__sub" style="margin:0;">📝 Dagens note</h3>
          <span class="dv__save" id="dvSave" aria-live="polite"></span>
        </div>
        <textarea class="dv__note" id="dvNote" placeholder="Skriv løs – fx »Henning kommer kl. 18 med sin kone – dæk bord ved vinduet«.&#10;Gemmes helt af sig selv, mens du skriver."></textarea>
      </div>
      <h3 class="kp__sub">📋 Dagens program</h3>
      ${dvTimelineHtml(iso, d, st)}
      <h3 class="kp__sub">🍲 Dagens ret${d.dishes.length > 1 ? 'ter' : ''}</h3>
      ${d.dishes.length
        ? d.dishes.map((dd) => {
            const s = S.getSoldFor(iso, dd.title);
            return `<div class="kalpanel__dish">${esc(dd.title)}
              ${dd.soldout ? '<span class="tag tag--red">🚫 Udsolgt</span>' : ''}
              ${!dd.soldout && dd.stock != null && dd.stock !== '' ? ` <span class="tag ${s >= dd.stock ? 'tag--red' : 'tag--accent'}">${s}/${dd.stock} solgt</span>` : (s ? ` <span class="tag">${s} solgt</span>` : '')}</div>`;
          }).join('')
        : '<div class="kalpanel__none">Ingen dagens ret sat endnu</div>'}
      <div class="dv__foot">
        <button class="abtn abtn--ghost" data-act="goto-orders" data-iso="${iso}">Se dagens bestillinger →</button>
        <button class="abtn abtn--ghost" data-goto="dagensret">Redigér dagens ret →</button>
      </div>`;
  }

  function renderDayModal() {
    const mask = document.getElementById('dvMask');
    if (!mask || !dvIso) return;
    const today = S.todayISO();
    const iso = dvIso;
    mask.querySelector('.dv').innerHTML = `
      <div class="dv__head">
        <div class="dv__headrow">
          <button class="dv__navbtn" data-dv="prev" aria-label="Ugen før" title="Ugen før">←</button>
          <h2 class="dv__title">${iso === today ? '🔴 ' : ''}${esc(S.formatDate(iso))}</h2>
          <button class="dv__navbtn" data-dv="next" aria-label="Ugen efter" title="Ugen efter">→</button>
          <button class="dv__close" data-dv="close" aria-label="Luk dagen">✕</button>
        </div>
        ${dvStripHtml(iso, today)}
      </div>
      <div class="dv__body">${dvBodyHtml(iso, today)}</div>`;
    /* noten sættes som value (aldrig som HTML) og editoren vokser med teksten */
    const ta = mask.querySelector('#dvNote');
    ta.value = S.getNote(iso);
    const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.max(ta.scrollHeight + 4, 140) + 'px'; };
    grow();
    ta.addEventListener('input', () => {
      dvNoteDirty = true;
      const ind = document.getElementById('dvSave');
      if (ind) { ind.textContent = 'Gemmer…'; ind.classList.remove('is-saved'); }
      clearTimeout(dvNoteTimer);
      dvNoteTimer = setTimeout(dvFlushNote, 800);
      grow();
    });
  }

  function openDayModal(iso) {
    dvFlushNote();
    dvIso = iso;
    let mask = document.getElementById('dvMask');
    if (!mask) {
      mask = document.createElement('div');
      mask.id = 'dvMask';
      mask.className = 'dvmask';
      mask.innerHTML = '<div class="dv" role="dialog" aria-modal="true"></div>';
      document.body.appendChild(mask);
      document.body.classList.add('dv-open');
      mask.addEventListener('click', (e) => {
        /* uge-strippen: hop direkte til en dag */
        const stripDay = e.target.closest('[data-dv-day]');
        const nav = e.target.closest('[data-dv]');
        if (stripDay || nav) {
          if (nav && nav.dataset.dv === 'close') { closeDayModal(); return; }
          dvFlushNote();
          if (stripDay) dvIso = stripDay.dataset.dvDay;
          else dvIso = S.addDays(dvIso, nav.dataset.dv === 'prev' ? -7 : 7);
          kalSelected = dvIso;
          if (kalMode === 'maaned' && dvIso.slice(0, 7) !== kalMonth) kalMonth = dvIso.slice(0, 7);
          renderDayModal();
          renderUge();
          return;
        }
        if (e.target === mask) closeDayModal();
      });
    }
    renderDayModal();
  }

  /* opdater vinduet når data ændrer sig – men ALDRIG mens der skrives
     eller en booking-editor / datovælger er åben i det */
  function refreshDayModal() {
    const mask = document.getElementById('dvMask');
    if (!mask || !dvIso) return;
    if (mask.querySelector('.bkedit:not([hidden])')) return;
    if (document.querySelector('.dp-pop:not([hidden])')) return;
    const ae = document.activeElement;
    if (ae && ae.closest && ae.closest('#dvMask textarea, #dvMask input, #dvMask select')) return;
    renderDayModal();
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.getElementById('ldMask')) { closeLukDialog(); return; }
    if (dvIso) closeDayModal();
  });

  /* ============================================================
     LUK DAGE – ÉT samlet sted: luk en enkelt dag, flere dage
     eller en hel ferie på én gang, direkte fra kalenderen.
     (Før var det spredt mellem kalenderen og Åbningstider, og
     ferie kunne kun være én periode ad gangen.)
     ============================================================ */
  function closeLukDialog() {
    document.getElementById('ldMask')?.remove();
    if (!document.getElementById('dvMask')) document.body.classList.remove('dv-open');
  }

  function openLukDialog(prefIso) {
    closeLukDialog();
    const today = S.todayISO();
    const start = prefIso && prefIso >= today ? prefIso : today;
    const mask = document.createElement('div');
    mask.id = 'ldMask';
    mask.className = 'dvmask';
    mask.innerHTML = `
      <div class="dv ld" role="dialog" aria-modal="true">
        <div class="dv__head">
          <div class="dv__headrow">
            <h2 class="dv__title">🚫 Luk dage</h2>
            <button class="dv__close" data-ld="close" aria-label="Luk">✕</button>
          </div>
        </div>
        <div class="dv__body">
          <p class="sub" style="color:var(--ink-soft);margin:0 0 14px;">Luk én dag, flere dage eller en hel ferie på én gang – fx personaledag, helligdage eller sommerferie. Lukkede dage bliver <strong>røde i kalenderen</strong>, og kunderne kan hverken bestille mad eller booke. I kan altid åbne dagene igen – her eller inde på den enkelte dag.</p>
          <div class="ld__grid">
            <label class="afield"><span>Fra dato</span><input type="date" id="ldFrom" value="${start}" min="${today}" /></label>
            <label class="afield"><span>Til og med</span><input type="date" id="ldTo" value="${start}" min="${today}" /></label>
          </div>
          <div class="ld__types" id="ldTypes">
            <button type="button" class="ldtype is-on" data-e="🔒" data-t="Lukket">🔒 Lukket</button>
            <button type="button" class="ldtype" data-e="👥" data-t="Personaledag">👥 Personaledag</button>
            <button type="button" class="ldtype" data-e="🌴" data-t="Ferie">🌴 Ferie</button>
            <button type="button" class="ldtype" data-e="🎉" data-t="Privat arrangement">🎉 Privat arrangement</button>
          </div>
          <label class="afield afield--wide" style="margin-top:8px;"><span>Hvorfor? <em>(valgfrit – vises i kalenderen)</em></span>
            <input id="ldReason" placeholder="Fx personaledag kl. 14-15" /></label>
          <div class="ld__count" id="ldCount"></div>
          <label class="bkedit__check" style="margin:10px 0 0;">
            <input type="checkbox" id="ldFerie" />
            <span><strong>🌴 Vis ferie-besked på hjemmesiden i perioden</strong><br/>
            <em>Kunderne ser beskeden som banner øverst på siden. Erstatter en evt. tidligere ferie-besked – der kan kun vises én ad gangen.</em></span>
          </label>
          <label class="afield afield--wide" id="ldMsgWrap" hidden style="margin-top:10px;"><span>Besked til kunderne</span>
            <textarea id="ldMsg" class="inline-input" rows="3"></textarea></label>
          <div class="dv__foot">
            <button class="abtn abtn--accent" id="ldClose">🚫 Luk dagene</button>
            <button class="abtn abtn--green" id="ldOpen">✅ Åbn dagene igen</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(mask);
    document.body.classList.add('dv-open');

    const range = () => {
      const f = $('#ldFrom').value, t = $('#ldTo').value;
      if (!f || !t || t < f) return null;
      const out = [];
      for (let d = f; d <= t && out.length < 90; d = S.addDays(d, 1)) out.push(d);
      return out;
    };
    const updateCount = () => {
      const days = range();
      const el = $('#ldCount');
      if (!days) { el.textContent = '⚠️ Vælg en periode – "til og med" skal være samme dag eller senere end "fra".'; return; }
      const already = days.filter((d) => S.getBlockedDates().includes(d)).length;
      el.innerHTML = `<strong>${days.length}</strong> dag${days.length === 1 ? '' : 'e'}: ${esc(S.formatDate(days[0], false))} – ${esc(S.formatDate(days[days.length - 1], false))}${already ? ` · ${already} er allerede lukket` : ''}`;
      /* forslag til ferie-besked, der følger de valgte datoer */
      const msg = $('#ldMsg');
      if (msg && !msg.dataset.touched) {
        const reopenTxt = S.formatDate(S.addDays(days[days.length - 1], 1));
        msg.value = `Vi holder lukket fra ${S.formatDate(days[0], false)} til og med ${S.formatDate(days[days.length - 1], false)} og åbner igen ${reopenTxt.charAt(0).toLowerCase()}${reopenTxt.slice(1)}. I er velkomne til at sende en forespørgsel i mellemtiden.`;
      }
    };
    updateCount();
    $('#ldFrom').addEventListener('change', () => {
      if ($('#ldTo').value < $('#ldFrom').value) $('#ldTo').value = $('#ldFrom').value;
      updateCount();
    });
    $('#ldTo').addEventListener('change', updateCount);
    $('#ldFerie').addEventListener('change', () => { $('#ldMsgWrap').hidden = !$('#ldFerie').checked; });
    $('#ldMsg').addEventListener('input', () => { $('#ldMsg').dataset.touched = '1'; });

    $('#ldTypes').addEventListener('click', (e) => {
      const btn = e.target.closest('.ldtype');
      if (!btn) return;
      $$('#ldTypes .ldtype').forEach((b) => b.classList.remove('is-on'));
      btn.classList.add('is-on');
    });
    $('#ldClose').addEventListener('click', () => {
      const days = range();
      if (!days) { toast('Vælg først en periode ⚠️'); return; }
      const typeBtn = $('#ldTypes .ldtype.is-on');
      const mark = { e: typeBtn.dataset.e, t: $('#ldReason').value.trim() || typeBtn.dataset.t };
      days.forEach((d) => { S.blockDate(d); S.setDayMark(d, mark); });
      if ($('#ldFerie').checked) {
        S.setClosure({
          active: true,
          from: days[0],
          reopen: S.addDays(days[days.length - 1], 1),
          message: $('#ldMsg').value.trim(),
        });
      }
      closeLukDialog();
      renderUge();
      refreshDayModal();
      toast(`${days.length} dag${days.length === 1 ? '' : 'e'} lukket 🚫${$('#ldFerie')?.checked ? ' – ferie-beskeden vises på hjemmesiden 🌴' : ''}`);
    });
    $('#ldOpen').addEventListener('click', () => {
      const days = range();
      if (!days) { toast('Vælg først en periode ⚠️'); return; }
      days.forEach((d) => S.unblockDate(d));
      /* dækker perioden ferie-beskeden, slukkes den også */
      const c = S.getClosure();
      if (c.active && c.from >= days[0] && c.reopen && c.reopen <= S.addDays(days[days.length - 1], 1)) {
        S.setClosure({ ...c, active: false });
      }
      closeLukDialog();
      renderUge();
      refreshDayModal();
      toast(`${days.length} dag${days.length === 1 ? '' : 'e'} åbnet igen ✅`);
    });
    mask.addEventListener('click', (e) => {
      if (e.target === mask || e.target.closest('[data-ld="close"]')) closeLukDialog();
    });
  }

  function renderKalMaaned(today) {
    const days = kalGridDays(kalMonth);
    const [y, m] = kalMonth.split('-').map(Number);
    const name = S.MONTHS[m - 1];
    const monthDays = days.filter((d) => d.slice(0, 7) === kalMonth);
    const mOrders = monthDays.flatMap((iso) => S.getOrders(iso));
    const mItems = mOrders.reduce((s, o) => s + itemsOf(o), 0);
    const mBookings = S.getBookings().filter((b) => b.date && b.date.slice(0, 7) === kalMonth && b.status !== 'afvist');

    /* alle dage i måneden med en note – så intet skrevet nogensinde forsvinder i mængden */
    const noted = monthDays.filter((iso) => (S.getNote(iso) || '').trim());

    $('#view-uge').innerHTML = `
      ${kalHeader(`${name[0].toUpperCase()}${name.slice(1)} ${y}`,
        `Hele måneden: <strong>${mOrders.length}</strong> bestillinger · <strong>${mItems}</strong> retter · <strong>${mBookings.length}</strong> booking${mBookings.length === 1 ? '' : 'er'} · tryk på en dag, så åbner den stort med noter og aftaler`)}
      <div class="acard kalcard">
        <div class="kalgrid kalgrid--head">${S.WEEKDAYS.map((w) => `<div class="kalwd">${w.slice(0, 3)}</div>`).join('')}</div>
        <div class="kalgrid">${days.map((iso) => kalCell(iso, today)).join('')}</div>
      </div>
      ${noted.length ? `
      <div class="acard">
        <div class="acard__head"><h2>📝 Noter i ${name}</h2></div>
        <p class="sub" style="color:var(--ink-soft);margin-bottom:10px;">${noted.length === 1 ? 'Én dag har en note' : `${noted.length} dage har noter`} denne måned – tryk på en note for at åbne dagen og skrive videre.</p>
        <div class="notelist">
          ${noted.map((iso) => `
          <button class="notelist__row ${iso < today ? 'notelist__row--past' : ''}" data-kal="day" data-iso="${iso}">
            <span class="notelist__date">${iso === today ? '🔴 I dag' : esc(S.formatDate(iso, false))}</span>
            <span class="notelist__txt">${esc(S.getNote(iso))}</span>
          </button>`).join('')}
        </div>
      </div>` : ''}`;
  }

  function renderKalUge(today) {
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
      ${kalHeader(`Uge ${S.weekNumber(ugeStart)}`,
        `${esc(S.formatDate(ugeStart, false))} – ${esc(S.formatDate(weekEnd, false))} · <strong>${weekOrders.length}</strong> bestillinger · <strong>${weekItems}</strong> retter · <strong>${weekPersons}</strong> personer · <strong>${weekBookings.length}</strong> booking${weekBookings.length === 1 ? '' : 'er'}`)}

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
          const st = dayStatus(iso);
          return `
          <div class="acard ugeday ugeday--st-${st.key} ${isToday ? 'ugeday--today' : ''} ${closed ? 'ugeday--closed' : ''}">
            <div class="ugeday__head">
              <strong>${S.WEEKDAYS[S.weekdayIndex(iso)]}${isToday ? ' · i dag' : ''}</strong>
              <span>${esc(S.formatDate(iso, false))}</span>
            </div>
            <div class="ugeday__status ${st.cls}">${st.full}</div>
            <div class="ugeday__dish">
              ${(() => {
                const ds = S.getDagensRetList(iso);
                if (!ds.length) return '<span style="color:var(--ink-soft);">Ingen dagens ret sat</span>';
                return ds.map((dd) => {
                  const s = S.getSoldFor(iso, dd.title);
                  return `<div>🍲 ${esc(dd.title)}${dd.soldout ? ' <span class="tag tag--red">🚫 Udsolgt</span>' : (dd.stock != null && dd.stock !== '' ? ` <span class="tag ${s >= dd.stock ? 'tag--red' : 'tag--accent'}">${s}/${dd.stock} solgt</span>` : '')}</div>`;
                }).join('');
              })()}
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
            <textarea class="inline-input ugeday__note" data-note="${iso}" rows="2" placeholder="Noter til dagen – gemmes automatisk…">${esc(S.getNote(iso))}</textarea>
            <div class="ugeday__actions">
              <button class="abtn" data-kal="day" data-iso="${iso}">📖 Åbn dagen stort</button>
              <button class="abtn abtn--ghost" data-act="goto-orders" data-iso="${iso}">Se bestillinger →</button>
              ${dayCloseBtn(iso, today)}
            </div>
          </div>`;
        }).join('')}
      </div>`;
  }

  function renderUge() {
    const today = S.todayISO();
    if (kalMode === 'maaned') renderKalMaaned(today);
    else renderKalUge(today);

    /* navigation + valg af dag (fælles for begge visninger) */
    $('#view-uge').onclick = (e) => {
      const el = e.target.closest && e.target.closest('[data-kal]');
      if (!el) return;
      const k = el.dataset.kal;
      if (k === 'mode-uge') kalMode = 'uge';
      else if (k === 'mode-maaned') kalMode = 'maaned';
      else if (k === 'prev') {
        if (kalMode === 'maaned') kalMonth = kalAddMonths(kalMonth, -1);
        else ugeStart = S.addDays(ugeStart, -7);
      }
      else if (k === 'next') {
        if (kalMode === 'maaned') kalMonth = kalAddMonths(kalMonth, 1);
        else ugeStart = S.addDays(ugeStart, 7);
      }
      else if (k === 'today') {
        kalMonth = S.todayISO().slice(0, 7);
        ugeStart = S.weekStart(S.todayISO());
        kalSelected = S.todayISO();
      }
      else if (k === 'lukdage') { openLukDialog(); return; }
      else if (k === 'day') {
        /* klik på en dag åbner den STORT oven på kalenderen */
        kalSelected = el.dataset.iso;
        if (kalMode === 'maaned' && kalSelected.slice(0, 7) !== kalMonth) kalMonth = kalSelected.slice(0, 7);
        renderUge();
        openDayModal(kalSelected);
        return;
      }
      renderUge();
    };

    /* dagsnoter gemmer sig selv, mens der skrives */
    const noteTimers = {};
    $('#view-uge').oninput = (e) => {
      const ta = e.target.closest && e.target.closest('.ugeday__note');
      if (!ta) return;
      const iso = ta.dataset.note;
      clearTimeout(noteTimers[iso]);
      noteTimers[iso] = setTimeout(() => { S.setNote(iso, ta.value); savedToast(); }, 900);
    };
  }

  /* ============================================================
     BESTILLINGER
     ============================================================ */
  let ordersDate = S.todayISO();
  let ordersAllDays = false; /* "Alle dage"-visning: alt samlet ét sted */

  function renderBestillinger() {
    if (ordersAllDays) { renderAlleDage(); return; }
    const orders = S.getOrders(ordersDate);
    /* nye bestillinger til andre dage må ALDRIG blive væk, bare fordi
       man står på i dag – de får deres egen linje med genveje.
       Både "ikke kørt endnu" OG "ikke set endnu" tælles med, så tallet
       på klokken og i menuen altid har et sted man kan trykke hen. */
    const elsewhere = S.getOrders()
      .filter((o) => (o.status === 'ny' || !o.read) && o.date !== ordersDate)
      .reduce((m, o) => m.set(o.date, (m.get(o.date) || 0) + 1), new Map());
    const elsewhereHtml = elsewhere.size ? `
      <div class="otherdays">
        <span class="otherdays__txt">🔔 Der er også nye bestillinger til andre dage:</span>
        ${[...elsewhere.entries()].sort().map(([d, n]) =>
          `<button class="abtn abtn--ghost" data-act="goto-orders" data-iso="${d}">${esc(S.formatDate(d, false))} · ${n} ny${n === 1 ? '' : 'e'}</button>`).join('')}
      </div>` : '';
    const itemsTotal = orders.reduce((s, o) => s + itemsOf(o), 0);
    const persons = orders.reduce((s, o) => s + personsOf(o), 0);
    const dish = S.getDagensRet(ordersDate);

    $('#view-bestillinger').innerHTML = `
      <div class="acard">
        <div class="acard__head">
          <h2>Bestillinger</h2>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
            <button class="abtn abtn--ghost" id="ordersPrev" ${ordersAllDays ? 'disabled' : ''}>←</button>
            <input type="date" class="inline-input" id="ordersDate" value="${ordersDate}" style="width:170px;" ${ordersAllDays ? 'disabled' : ''} />
            <button class="abtn abtn--ghost" id="ordersNext" ${ordersAllDays ? 'disabled' : ''}>→</button>
            <button class="abtn" id="ordersToday" ${ordersAllDays ? 'disabled' : ''}>I dag</button>
            <button class="abtn ${ordersAllDays ? 'abtn--accent' : 'abtn--ghost'}" id="ordersAll">${ordersAllDays ? '📅 Vis én dag' : '📚 Alle dage'}</button>
            <button class="abtn abtn--ghost" id="ordersLog" title="Se hvad der er sket – også med bestillinger der er slettet">🕓 Historik</button>
          </div>
        </div>
        <p class="sub" style="color:var(--ink-soft);margin-bottom:14px;">
          ${esc(S.formatDate(ordersDate))} · ${dish ? `Dagens ret: <strong>${esc(dish.title)}</strong> · ` : ''}${orders.length} bestillinger · ${itemsTotal} retter · ${persons} personer
        </p>
        ${elsewhereHtml}
        ${orders.length ? `<div class="prodlist" style="margin-bottom:16px;">${dishTotals(orders).map(([n, q]) => `<span class="prod"><b>${q}</b>${esc(n)}</span>`).join('')}</div>` : ''}
        ${(() => {
          const pending = orders.filter((o) => o.status === 'ny');
          const done = orders.filter((o) => o.status !== 'ny');
          return `
        <div class="statuschips">
          <span class="schip schip--todo ${pending.length ? 'is-on' : ''}">🔥 ${pending.length} mangler at blive kørt</span>
          <span class="schip schip--done ${done.length ? 'is-on' : ''}">✅ ${done.length} kørt</span>
        </div>
        ${pending.length ? `
        <h3 class="kp__sub">🔥 Mangler <em class="kp__sub-hint">· tryk ✓ når bestillingen er kørt</em></h3>
        <div class="rowlist">${pending.map((o) => orderRow(o)).join('')}</div>`
          : `<div class="empty">${orders.length ? 'Alle bestillinger er kørt – flot! 🎉'
              : (elsewhere.size
                ? `Ingen bestillinger til <strong>${esc(S.formatDate(ordersDate, false))}</strong> – men der er nye til andre dage. Tryk på en dato herover ↑, eller på 📚 Alle dage.`
                : 'Ingen bestillinger på denne dato.')}</div>`}
        ${done.length ? `
        <h3 class="kp__sub">✅ Kørt / færdige <em class="kp__sub-hint">· tryk ↩ Gendan hvis noget var en fejl</em></h3>
        <div class="rowlist">${done.map((o) => orderRow(o)).join('')}</div>` : ''}`;
        })()}
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
    $('#ordersAll').addEventListener('click', () => { ordersAllDays = true; renderBestillinger(); });
    $('#ordersLog').addEventListener('click', visHistorik);
  }

  /* ALLE bestillinger samlet ét sted – grupperet og sorteret på dato,
     så intet nogensinde gemmer sig på en dag, man ikke står på. */
  function renderAlleDage() {
    const today = S.todayISO();
    const all = S.getOrders()
      .slice()
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''));
    const kommende = all.filter((o) => o.date >= today);
    const tidligere = all.filter((o) => o.date < today).reverse();
    const nyIalt = all.filter((o) => o.status === 'ny').length;

    const groupHtml = (list) => {
      const days = new Map();
      list.forEach((o) => { if (!days.has(o.date)) days.set(o.date, []); days.get(o.date).push(o); });
      return [...days.entries()].map(([d, os]) => {
        const nye = os.filter((o) => o.status === 'ny').length;
        return `
        <div class="alldag">
          <div class="alldag__head">
            <strong>${d === today ? '🔴 I dag' : esc(S.formatDate(d))}</strong>
            <span>${os.length} bestilling${os.length === 1 ? '' : 'er'} · ${os.reduce((s2, o) => s2 + itemsOf(o), 0)} retter${nye ? ` · <b class="alldag__new">🔥 ${nye} mangler</b>` : ' · ✅ alle kørt'}</span>
            <button class="abtn abtn--ghost" data-act="goto-orders" data-iso="${d}">Åbn dagen →</button>
          </div>
          <div class="rowlist">${os.map((o) => orderRow(o, false)).join('')}</div>
        </div>`;
      }).join('');
    };

    $('#view-bestillinger').innerHTML = `
      <div class="acard">
        <div class="acard__head">
          <h2>Bestillinger</h2>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
            <button class="abtn abtn--ghost" id="ordersPrev" disabled>←</button>
            <input type="date" class="inline-input" id="ordersDate" value="${ordersDate}" style="width:170px;" disabled />
            <button class="abtn abtn--ghost" id="ordersNext" disabled>→</button>
            <button class="abtn" id="ordersToday" disabled>I dag</button>
            <button class="abtn abtn--accent" id="ordersAll">📅 Vis én dag</button>
            <button class="abtn abtn--ghost" id="ordersLog" title="Se hvad der er sket – også med bestillinger der er slettet">🕓 Historik</button>
          </div>
        </div>
        <p class="sub" style="color:var(--ink-soft);margin-bottom:12px;">
          Alle bestillinger samlet – sorteret efter dato. ${all.length} i alt${nyIalt ? ` · <strong>${nyIalt}</strong> mangler at blive kørt` : ' · alle er kørt ✅'}
        </p>
        <p class="sub" style="color:var(--ink-soft);margin-bottom:14px;">
          Selskaber, arrangementer og møder ligger for sig
          <button class="abtn abtn--ghost" data-goto="bookinger">📅 Åbn bookinger →</button>
        </p>
        ${kommende.length ? `<h3 class="kp__sub">📅 I dag og fremad</h3>${groupHtml(kommende)}` : '<p class="sub" style="color:var(--ink-soft);">Ingen kommende bestillinger.</p>'}
        ${tidligere.length ? `
        <details class="donefold" style="margin-top:18px;">
          <summary>🕓 Tidligere dage (${tidligere.length}) <em>· tryk for at se</em></summary>
          <div class="ryddop">
            <span>Gamle bestillinger fra dage der er overstået – de kan roligt ryddes væk.</span>
            <button class="abtn abtn--danger" id="ordersPurge">🗑 Slet alle ${tidligere.length} gamle</button>
          </div>
          <div style="margin-top:10px;">${groupHtml(tidligere)}</div>
        </details>` : ''}
      </div>`;

    $('#ordersAll').addEventListener('click', () => { ordersAllDays = false; renderBestillinger(); });
    $('#ordersLog').addEventListener('click', visHistorik);
    /* ét tryk rydder alle overståede dage – det er ikke noget man vil
       sidde og gøre én ad gangen efter en testperiode */
    const purge = $('#ordersPurge');
    if (purge) {
      purge.addEventListener('click', async () => {
        const ja = await bekraeftFarligt({
          titel: `Slet ${tidligere.length} gammel${tidligere.length === 1 ? '' : 'e'} bestilling${tidligere.length === 1 ? '' : 'er'}?`,
          linjer: [`Fra ${new Set(tidligere.map((o) => o.date)).size} dag(e) der er overstået`,
            `Ældste: ${S.formatDate(tidligere[tidligere.length - 1].date, false)}`,
            `Nyeste: ${S.formatDate(tidligere[0].date, false)}`],
          note: 'I dag og alle kommende dage røres ikke. Det kan ikke fortrydes.',
          knap: `🗑 Slet de ${tidligere.length} gamle`,
        });
        if (!ja) return;
        purge.disabled = true;
        purge.textContent = 'Sletter…';
        let fejl = 0;
        for (const o of tidligere) {
          /* eslint-disable no-await-in-loop */
          const ok = await S.deleteOrder(o.id);
          if (!ok) fejl++;
        }
        renderBestillinger();
        renderBell();
        if (!fejl) toast(`${tidligere.length} gamle bestillinger slettet`);
      });
    }
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

      <details class="acard acard--fold" id="newBookingFold">
        <summary class="acard__head acard__head--sum">
          <h2>➕ Opret booking selv</h2>
          <span class="sub">ringer nogen ind, eller aftaler I det i butikken? Skriv den ind her</span>
        </summary>
        <div class="nbk" style="margin-top:14px;">
          <div class="nbk__grid">
            <label class="afield"><span>Type</span>
              <select id="nbkKind">
                <option value="arrangement">🎉 Arrangement / selskab</option>
                <option value="moede">📅 Møde</option>
              </select>
            </label>
            <label class="afield"><span>Navn på kunden</span>
              <input type="text" id="nbkName" placeholder="Fx Anne Jensen" autocomplete="off" />
            </label>
            <label class="afield"><span>Telefon</span>
              <input type="tel" id="nbkPhone" inputmode="tel" placeholder="12 34 56 78" autocomplete="off" />
            </label>
            <label class="afield"><span>Dato</span>
              <input type="date" id="nbkDate" min="${today}" />
            </label>
            <label class="afield"><span>Tidspunkt</span>
              <select id="nbkTime"></select>
            </label>
            <label class="afield" id="nbkPersonsWrap"><span>Antal personer <em>(valgfrit)</em></span>
              <input type="number" id="nbkPersons" min="1" max="500" placeholder="fx 25" />
            </label>
          </div>
          <label class="afield afield--wide"><span>Hvad drejer det sig om? / intern note</span>
            <textarea id="nbkNote" rows="2" placeholder="Fx: 50 års fødselsdag, buffet, én er glutenallergiker"></textarea>
          </label>
          <label class="nbk__check" id="nbkBlockWrap">
            <input type="checkbox" id="nbkBlock" checked />
            <span><strong>🍲 Luk dagen for andre arrangementer &amp; madbestillinger</strong><br/>
            <em>Fjern fluebenet ved små selskaber, hvor Spiis holder åbent som normalt.</em></span>
          </label>
          <button class="abtn abtn--accent abtn--big" id="nbkSave">Opret booking ✓</button>
        </div>
      </details>

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

    /* ---- Opret booking selv (telefon / i butikken) ---- */
    const nbkTime = $('#nbkTime');
    if (nbkTime) {
      const opts = ['<option value="">– vælg tid –</option>'];
      for (let m = 8 * 60; m <= 23 * 60 + 30; m += 30) {
        const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        opts.push(`<option value="${t}">kl. ${t}</option>`);
      }
      nbkTime.innerHTML = opts.join('');
      nbkTime.value = '18:00';

      SpiisDatepicker.attach($('#nbkDate'), {
        min: today,
        marker: (iso) => S.getBookings().some((x) =>
          x.kind === 'arrangement' && x.status === 'bekraeftet' && x.date === iso),
      });

      const nbkKind = $('#nbkKind');
      const nbkBlockWrap = $('#nbkBlockWrap');
      const syncKind = () => { nbkBlockWrap.style.display = nbkKind.value === 'moede' ? 'none' : ''; };
      nbkKind.addEventListener('change', syncKind);
      syncKind();

      $('#nbkSave').addEventListener('click', async () => {
        const kind = nbkKind.value;
        const name = $('#nbkName').value.trim();
        const phone = $('#nbkPhone').value.trim();
        const date = $('#nbkDate').value;
        const time = $('#nbkTime').value;
        const persons = $('#nbkPersons').value.trim();
        const note = $('#nbkNote').value.trim();
        if (!name || !phone) { toast('Skriv mindst navn og telefon'); return; }
        if (!date) { toast('Vælg en dato for aftalen'); return; }
        const isMoede = kind === 'moede';
        const subject = isMoede
          ? (persons ? `Møde · ${persons} pers.` : 'Møde')
          : (persons ? `Arrangement · ${persons} pers.` : 'Arrangement');
        const btn = $('#nbkSave');
        btn.disabled = true;
        const res = await S.addBooking({
          kind, subject, desc: '', name, phone, email: '',
          date, time, staff_note: note,
          status: 'bekraeftet', read: true,
          block_orders: isMoede ? false : $('#nbkBlock').checked,
        });
        btn.disabled = false;
        if (!res.ok) { toast('Kunne ikke gemme – tjek nettet og prøv igen'); return; }
        renderListViews();
        toast(`Booking oprettet: ${S.formatDate(date)}${time ? ` kl. ${time}` : ''} ✓`);
      });
    }
  }

  /* ============================================================
     NYHEDER – opslag på forsiden (juleplatter, halloween …)
     ============================================================ */
  let newsImageBlob = null; /* det komprimerede billede til det nye opslag */

  /* telefonbilleder er ofte 3-8 MB og tit stående – vi beskærer midt-på til
     et pænt VANDRET format (3:2) og pakker som JPEG. Så er billedet let,
     ensartet og bliver aldrig skævt beskåret ved visning – på desktop som telefon. */
  function compressImage(file, maxW = 1400, ratio = 3 / 2, quality = 0.85) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const srcRatio = img.width / img.height;
        let sw = img.width, sh = img.height, sx = 0, sy = 0;
        if (srcRatio > ratio) { sw = Math.round(img.height * ratio); sx = Math.round((img.width - sw) / 2); }
        else { sh = Math.round(img.width / ratio); sy = Math.round((img.height - sh) / 2); }
        const w = Math.min(maxW, sw);
        const h = Math.round(w / ratio);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
        URL.revokeObjectURL(url);
        c.toBlob((b) => resolve(b || file), 'image/jpeg', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  function newsRow(n) {
    const off = n.active === false;
    return `
      <div class="row newsed ${off ? 'newsed--off' : ''}" data-id="${n.id}">
        ${n.image
          ? `<img class="newsed__thumb" src="${esc(n.image)}" alt="" loading="lazy" />`
          : '<span class="newsed__thumb newsed__thumb--none">📣</span>'}
        <div class="row__main">
          <input class="inline-input" data-nf="title" maxlength="80" value="${esc(n.title)}" />
          <textarea class="inline-input" data-nf="text" rows="2" placeholder="Tekst (valgfrit)">${esc(n.text || '')}</textarea>
          <div class="newsed__toggles">
            <label class="newsed__cta"><input type="checkbox" data-nf="cta" ${n.cta ? 'checked' : ''} /> "Bestil her"-knap</label>
            <label class="newsed__cta"><input type="checkbox" data-nf="orderable" ${n.orderable ? 'checked' : ''} /> Bestilbar</label>
          </div>
          <div class="newsed__order" ${n.orderable ? '' : 'hidden'}>
            <input class="inline-input" data-nf="price" type="number" min="0" placeholder="Pris kr." value="${esc(n.price ?? '')}" title="Pris pr. stk." />
            <input class="inline-input" data-nf="orderBy" type="date" value="${esc(n.orderBy || '')}" title="Bestil senest" />
            <input class="inline-input" data-nf="orderMax" type="number" min="1" placeholder="Max antal" value="${esc(n.orderMax ?? '')}" title="Max antal i alt" />
          </div>
        </div>
        <div class="row__actions">
          ${off ? '<span class="tag">Skjult</span>' : '<span class="tag tag--green">På siden</span>'}
          <button class="abtn ${off ? 'abtn--green' : 'abtn--ghost'}" data-act="news-toggle" data-id="${n.id}">${off ? 'Vis igen' : 'Skjul'}</button>
          <button class="abtn abtn--danger abtn--icon" data-act="news-del" data-id="${n.id}" title="Slet nyheden">✕</button>
        </div>
      </div>`;
  }

  function renderNyheder() {
    const posts = S.getNews();
    newsImageBlob = null;
    $('#view-nyheder').innerHTML = `
      <div class="acard">
        <div class="acard__head">
          <h2>📣 Læg en nyhed på hjemmesiden</h2>
          <span class="sub">vises som det første, kunderne møder – lige under forsiden</span>
        </div>
        <div class="formgrid">
          <label class="afield afield--full"><span>Overskrift</span>
            <input id="newsTitle" maxlength="80" placeholder="fx Juleplatter – bestil senest 18. december" /></label>
          <label class="afield afield--full"><span>Tekst</span>
            <textarea id="newsText" class="inline-input" rows="3" placeholder="Kort og lækkert – hvad, hvornår og pris."></textarea></label>
          <label class="afield"><span>Billede (anbefales – et lækkert madfoto sælger)</span>
            <input id="newsImage" type="file" accept="image/*" /></label>
          <label class="afield newsed__cta" style="align-self:end;"><span></span>
            <span><input type="checkbox" id="newsCta" checked /> Vis "Bestil her"-knap (sender til bestillingssiden)</span></label>
          <label class="afield afield--full newsed__cta">
            <span><input type="checkbox" id="newsOrderable" /> <strong>Gør bestilbar</strong> – kunden bestiller retten direkte fra nyheden (dato · antal · navn · tlf)</span></label>
        </div>
        <div id="newsOrderFields" class="newsorder-fields" hidden>
          <label class="afield"><span>Pris pr. stk. (kr.)</span><input id="newsPrice" type="number" min="0" placeholder="fx 149" /></label>
          <label class="afield"><span>Bestil senest (valgfrit)</span><input id="newsOrderBy" type="date" /></label>
          <label class="afield"><span>Max antal i alt (valgfrit)</span><input id="newsOrderMax" type="number" min="1" placeholder="fx 40" /></label>
        </div>
        <div id="newsPreview" class="newsprev" hidden></div>
        <p class="sub" style="color:var(--ink-soft);margin-top:12px;">
          💡 En bestilbar nyhed lander automatisk i <strong>Køreplanen</strong> og tælles i
          <strong>Kalenderen</strong> – ligesom alle andre bestillinger.
        </p>
        <button class="abtn abtn--accent abtn--big" id="newsPublish" style="margin-top:14px;">📣 Læg på hjemmesiden</button>
      </div>

      <div class="acard">
        <div class="acard__head">
          <h2>Nyheder på siden</h2>
          <span class="sub">nyeste øverst · ret direkte i felterne – gemmes automatisk</span>
        </div>
        <div class="rowlist" id="newsList">
          ${posts.length ? posts.map(newsRow).join('') : '<div class="empty">Ingen nyheder endnu. Den første kunne være juleplatter eller en halloween-aften … 🎃</div>'}
        </div>
      </div>`;

    /* vis pris/deadline/max-felterne, når "Gør bestilbar" slås til */
    $('#newsOrderable').addEventListener('change', (e) => {
      $('#newsOrderFields').hidden = !e.target.checked;
    });

    /* billede: komprimér med det samme og vis et eksempel */
    $('#newsImage').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      const prev = $('#newsPreview');
      if (!file) { newsImageBlob = null; prev.hidden = true; return; }
      newsImageBlob = await compressImage(file);
      prev.innerHTML = `<img src="${URL.createObjectURL(newsImageBlob)}" alt="" /> <span>Billedet er klar (${Math.round(newsImageBlob.size / 1024)} kB) ✓</span>`;
      prev.hidden = false;
    });

    $('#newsPublish').addEventListener('click', async () => {
      const title = $('#newsTitle').value.trim();
      if (!title) { toast('Skriv en overskrift til nyheden'); return; }
      const btn = $('#newsPublish');
      btn.disabled = true;
      btn.textContent = 'Lægger op …';
      let image = '';
      if (newsImageBlob) {
        const up = await S.uploadNewsImage(newsImageBlob, 'nyhed.jpg');
        if (!up.ok) {
          toast('Billedet kunne ikke lægges op – tjek internettet og prøv igen.');
          btn.disabled = false;
          btn.textContent = '📣 Læg på hjemmesiden';
          return;
        }
        image = up.url;
      }
      const orderable = $('#newsOrderable').checked;
      S.addNews({
        title, text: $('#newsText').value.trim(), image, cta: $('#newsCta').checked,
        orderable,
        price: orderable && $('#newsPrice').value ? Number($('#newsPrice').value) : null,
        orderBy: orderable ? ($('#newsOrderBy').value || '') : '',
        orderMax: orderable && $('#newsOrderMax').value ? Number($('#newsOrderMax').value) : null,
      });
      toast('Nyheden er på hjemmesiden ✓');
      renderNyheder();
    });

    /* eksisterende opslag retter sig selv, mens der skrives */
    const newsTimers = {};
    const saveNewsRow = (rowEl) => {
      const id = rowEl.dataset.id;
      const orderable = $('[data-nf="orderable"]', rowEl).checked;
      const priceEl = $('[data-nf="price"]', rowEl);
      const maxEl = $('[data-nf="orderMax"]', rowEl);
      S.updateNews(id, {
        title: $('[data-nf="title"]', rowEl).value.trim(),
        text: $('[data-nf="text"]', rowEl).value.trim(),
        cta: $('[data-nf="cta"]', rowEl).checked,
        orderable,
        price: priceEl.value ? Number(priceEl.value) : null,
        orderBy: $('[data-nf="orderBy"]', rowEl).value || '',
        orderMax: maxEl.value ? Number(maxEl.value) : null,
      });
      const orderFields = rowEl.querySelector('.newsed__order');
      if (orderFields) orderFields.hidden = !orderable;
      savedToast();
    };
    $('#newsList').oninput = (e) => {
      const rowEl = e.target.closest && e.target.closest('.newsed');
      if (!rowEl || !e.target.matches('[data-nf]')) return;
      clearTimeout(newsTimers[rowEl.dataset.id]);
      newsTimers[rowEl.dataset.id] = setTimeout(() => saveNewsRow(rowEl), 900);
    };
    $('#newsList').onchange = (e) => {
      const rowEl = e.target.closest && e.target.closest('.newsed');
      if (!rowEl || !e.target.matches('[data-nf]')) return;
      clearTimeout(newsTimers[rowEl.dataset.id]);
      saveNewsRow(rowEl);
    };
  }

  /* ============================================================
     DAGENS RET – planlægger
     ============================================================ */
  function pdDishRow(day, d) {
    const on = day.open;
    const sold = d.title ? S.getSoldFor(day.iso, d.title) : 0;
    return `
      <div class="pd-dish ${d.soldout ? 'pd-dish--soldout' : ''}" data-out="${d.soldout ? '1' : ''}" data-navn="${d.title ? '1' : ''}">
        <input class="inline-input" data-f="title" placeholder="${on ? 'Ret, fx Boller i karry' : 'Lukket'}" value="${esc(d.title || '')}" ${on ? '' : 'disabled'} />
        <textarea class="inline-input pd-dish__desc" data-f="desc" rows="1" placeholder="Beskrivelse – én linje pr. punkt (fx alt i en tapas)" ${on ? '' : 'disabled'}>${esc(d.desc || '')}</textarea>
        <input class="inline-input" data-f="price" type="number" min="0" placeholder="Pris" value="${esc(d.price ?? '')}" ${on ? '' : 'disabled'} />
        <input class="inline-input" data-f="stock" type="number" min="0" placeholder="Antal" title="Antal portioner – lad stå tomt for ubegrænset" value="${esc(d.stock ?? '')}" ${on ? '' : 'disabled'} />
        <button type="button" class="abtn ${d.soldout ? 'abtn--green' : 'abtn--ghost'} pd-dish__so" data-soldout title="${d.soldout ? 'Åbn for bestilling igen' : 'Meld retten udsolgt med ét tryk'}" ${on ? '' : 'disabled'}>${d.soldout ? '✅ Åbn igen' : '🚫 Udsolgt'}</button>
        <button type="button" class="abtn abtn--danger abtn--icon" data-delret title="Fjern retten" ${on ? '' : 'disabled'}>✕</button>
        ${sold ? `<small class="pd-dish__sold">solgt: ${sold}${d.stock != null && d.stock !== '' ? ` / ${d.stock}` : ''}</small>` : ''}
        <!-- billede er FRIVILLIGT. Er der intet, ser forsiden ud præcis
             som den plejer – kortet ændrer sig kun, når der ER et. -->
        <div class="pd-dish__foto" data-img="${esc(d.img || '')}">
          ${d.img
            ? `<img src="${esc(d.img)}" alt="" /><button type="button" class="abtn abtn--ghost" data-fjernfoto>✕ Fjern billede</button>`
            : `<label class="abtn abtn--ghost pd-dish__vaelg">📷 Tilføj billede <em>(valgfrit)</em>
                 <input type="file" accept="image/*" hidden data-fotofil ${on ? '' : 'disabled'} /></label>`}
        </div>
      </div>`;
  }

  function renderDagensRetEditor() {
    const plan = S.getPlan(14);
    $('#view-dagensret').innerHTML = `
      <div class="acard">
        <div class="acard__head">
          <h2>🍲 Planlæg dagens ret(ter)</h2>
          <span class="sub">alt gemmes automatisk – der kan være FLERE retter samme dag, og "🚫 Udsolgt" lukker en ret med ét tryk</span>
        </div>
        <div class="planner">
          ${plan.map((day) => {
            const dishes = (day.dishes && day.dishes.length) ? day.dishes : [{ title: '', desc: '', price: '', stock: '' }];
            const isToday = day.iso === S.todayISO();
            return `
            <div class="planday planday--multi ${day.open ? '' : 'planday--closed'} ${isToday ? 'planday--today' : ''}" data-iso="${day.iso}">
              <div class="planday__date">
                <strong>${day.weekday}${isToday ? ' · i dag' : ''}</strong>
                <small>${esc(S.formatDate(day.iso, false))}${day.open ? '' : ' · lukket'}</small>
              </div>
              <div class="planday__dishes">
                ${dishes.map((d) => pdDishRow(day, d)).join('')}
                ${day.open ? '<button type="button" class="abtn abtn--ghost planday__add" data-addret>＋ Tilføj ret mere</button>' : ''}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;

    /* auto-gem: hver dags felter gemmer selv, mens der skrives (pr. dag) */
    const dayTimers = {};
    $('#view-dagensret').oninput = (e) => {
      const row = e.target.closest && e.target.closest('.planday');
      if (!row) return;
      /* billed-knappen dukker først op, når dagen HAR en ret – ellers stod
         der "Tilføj billede" under fjorten tomme dage på én gang */
      if (e.target.matches('[data-f="title"]')) {
        const dish = e.target.closest('.pd-dish');
        if (dish) dish.dataset.navn = e.target.value.trim() ? '1' : '';
      }
      const iso = row.dataset.iso;
      clearTimeout(dayTimers[iso]);
      dayTimers[iso] = setTimeout(() => saveDay(row, true), 900);
    };

    /* valgfrit billede til en ret – telefonbilleder pakkes ned først,
       så en 5 MB mobilfoto ikke gør forsiden tung at hente */
    $('#view-dagensret').onchange = async (e) => {
      const fil = e.target.closest('[data-fotofil]');
      if (!fil || !fil.files || !fil.files[0]) return;
      const row = fil.closest('.planday');
      const boks = fil.closest('.pd-dish__foto');
      const label = boks.querySelector('.pd-dish__vaelg');
      if (label) label.textContent = 'Lægger billedet op …';
      const lille = await compressImage(fil.files[0], 1200, 4 / 3, 0.84);
      const up = await S.uploadNewsImage(lille, 'dagensret.jpg');
      if (!up.ok) {
        toast('⚠️ Billedet kunne ikke lægges op. Tjek nettet og prøv igen.', true);
        renderDagensRetEditor();
        return;
      }
      boks.dataset.img = up.url;
      saveDay(row, true);
      renderDagensRetEditor();
      toast('Billedet er lagt op ✓');
    };
    /* udsolgt-knap, fjern-ret og tilføj-ret */
    $('#view-dagensret').onclick = (e) => {
      const row = e.target.closest && e.target.closest('.planday');
      if (!row) return;
      const soBtn = e.target.closest('[data-soldout]');
      if (soBtn) {
        const dishEl = soBtn.closest('.pd-dish');
        dishEl.dataset.out = dishEl.dataset.out === '1' ? '' : '1';
        saveDay(row);
        renderDagensRetEditor();
        return;
      }
      if (e.target.closest('[data-fjernfoto]')) {
        e.target.closest('.pd-dish__foto').dataset.img = '';
        saveDay(row);
        renderDagensRetEditor();
        return;
      }
      if (e.target.closest('[data-delret]')) {
        e.target.closest('.pd-dish').remove();
        saveDay(row);
        renderDagensRetEditor();
        return;
      }
      if (e.target.closest('[data-addret]')) {
        const add = e.target.closest('[data-addret]');
        add.insertAdjacentHTML('beforebegin', pdDishRow({ iso: row.dataset.iso, open: true }, { title: '', desc: '', price: '', stock: '' }));
        const inp = add.previousElementSibling.querySelector('[data-f="title"]');
        if (inp) inp.focus();
      }
    };
  }

  function saveDay(rowEl, silent = false) {
    const iso = rowEl.dataset.iso;
    const dishes = Array.from(rowEl.querySelectorAll('.pd-dish')).map((el) => {
      const priceRaw = $('[data-f="price"]', el).value;
      const stockRaw = $('[data-f="stock"]', el).value;
      const foto = $('.pd-dish__foto', el);
      return {
        title: $('[data-f="title"]', el).value.trim(),
        desc: $('[data-f="desc"]', el).value.trim(),
        price: priceRaw ? Number(priceRaw) : null,
        stock: stockRaw === '' ? null : Number(stockRaw),
        soldout: el.dataset.out === '1',
        img: (foto && foto.dataset.img) || '',
      };
    }).filter((d) => d.title);
    S.setDagensRetList(iso, dishes);
    if (silent) savedToast();
    else toast(dishes.length ? `${S.formatDate(iso)}: ${dishes.map((d) => `"${d.title}"${d.soldout ? ' (udsolgt)' : ''}`).join(' · ')} gemt ✓` : `${S.formatDate(iso)}: dagens ret fjernet`);
    renderBell();
  }

  /* ============================================================
     MENUKORT – editor
     ============================================================ */
  function renderMenuEditor() {
    const menu = S.getMenu();
    const st = S.getSettings();
    const tapasItems = (Array.isArray(st.tapasItems) && st.tapasItems.length ? st.tapasItems : S.DEFAULT_TAPAS_ITEMS).join('\n');
    $('#view-menukort').innerHTML = `
      <div class="acard">
        <div class="acard__head">
          <h2>🧀 Spiis Tapas</h2>
          <span class="sub">bestilles altid senest dagen før – alt her styrer tapas-delen på hjemmesiden</span>
        </div>
        <div class="formgrid">
          <label class="afield"><span>Pris pr. person (kr.)</span>
            <input id="tapasPrice" type="number" min="0" value="${esc(st.tapasPrice ?? 199)}" /></label>
          <label class="afield"><span>Cava pr. flaske (kr.)</span>
            <input id="tapasCavaPrice" type="number" min="0" value="${esc(st.tapasCavaPrice ?? 150)}" /></label>
          <label class="afield afield--full"><span>Det får I – én linje pr. punkt</span>
            <textarea id="tapasItems" class="inline-input" rows="6">${esc(tapasItems)}</textarea></label>
        </div>
        <p class="sub" style="color:var(--ink-soft);margin-top:8px;">Gemmes automatisk – prisen for 2 personer inkl. Cava regnes selv ud på hjemmesiden.</p>
      </div>

      <div class="acard">
        <div class="acard__head">
          <h2>📖 Fast sortiment</h2>
          <span class="sub">alt gemmes automatisk, mens du skriver</span>
        </div>
        <p class="sub" style="color:var(--ink-soft);margin-bottom:16px;">Redigér kategorier og retter – ændringer er på hjemmesiden med det samme.</p>
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
      </div>`;

    function collectMenu() {
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
      return { categories, weekly };
    }
    /* gemmer og gen-tegner (bruges ved knap-tryk som udsolgt/tilføj/slet) */
    function collectAndSave() {
      S.setMenu(collectMenu());
      savedToast();
      renderMenuEditor();
    }
    /* gemmer STILLE mens man skriver – uden at gen-tegne, så markøren bliver stående */
    const autosaveMenu = debounce(() => {
      S.setMenu(collectMenu());
      savedToast();
    }, 900);
    $('#view-menukort').oninput = (e) => {
      if (e.target.matches && e.target.matches('input, select')) autosaveMenu();
    };
    /* når man forlader et felt (eller vælger i en liste), gemmes straks */
    $('#view-menukort').onchange = (e) => {
      if (e.target.matches && e.target.matches('input, select')) {
        S.setMenu(collectMenu());
        savedToast();
      }
    };
    /* tapas gemmer sig selv, mens der skrives */
    const saveTapas = debounce(() => {
      S.updateSettings({
        tapasPrice: Number($('#tapasPrice').value) || 199,
        tapasCavaPrice: Number($('#tapasCavaPrice').value) || 150,
        tapasItems: $('#tapasItems').value.split('\n').map((l) => l.trim()).filter(Boolean),
      });
      savedToast();
    }, 800);
    ['#tapasPrice', '#tapasCavaPrice', '#tapasItems'].forEach((sel) => {
      $(sel)?.addEventListener('input', saveTapas);
    });

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

    /* selects og talfelter gemmer også selv ved ændring */
    $('#view-menukort').onchange = (e) => {
      if (e.target.matches && e.target.matches('input, select')) autosaveMenu();
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
    const c = S.getClosure();
    const paused = !!S.getSettings().ordersPaused;
    $('#view-tider').innerHTML = `
      <div class="acard pausecard ${paused ? 'is-off' : ''}">
        <div class="acard__head">
          <h2>${paused ? '🛑 Online bestilling er SLUKKET' : '🟢 Online bestilling er tændt'}</h2>
          <span class="sub">nødbremsen – slukker alle bestillinger på hjemmesiden med det samme</span>
        </div>
        <p class="sub" style="color:var(--ink-soft);margin-bottom:12px;">
          ${paused
            ? 'Kunderne kan ikke bestille online lige nu. De ser jeres besked og opfordres til at ringe. Menukort, åbningstider og kontakt er stadig synlige.'
            : 'Alt kører normalt. Skru fra her, hvis I fx er underbemandede, har travlt eller udstyret driller – det virker med det samme på hjemmesiden.'}
        </p>
        <label class="afield afield--wide"><span>Besked til kunderne <em>(valgfrit)</em></span>
          <input id="pausedMsg" placeholder="Fx: Vi har ekstra travlt i dag – ring til os, så finder vi ud af det" value="${esc(S.getSettings().ordersPausedMsg || '')}" /></label>
        <button class="abtn ${paused ? 'abtn--green' : 'abtn--danger'} abtn--big" id="pauseToggle" style="margin-top:12px;">
          ${paused ? '🟢 Tænd for online bestilling igen' : '🛑 Sluk for online bestilling'}
        </button>
      </div>

      <div class="acard">
        <div class="acard__head">
          <h2>🌴 Ferie / luk for bestillinger</h2>
          <span class="sub">luk madbestilling i en periode – forespørgsler, møder og kontakt er stadig åbne</span>
        </div>
        <label class="ferie__toggle"><input type="checkbox" id="closureActive" ${c.active ? 'checked' : ''} /> <strong>Luk for bestillinger i en periode</strong></label>
        <div id="closureFields" class="closure-fields" ${c.active ? '' : 'hidden'}>
          <label class="afield"><span>Fra dato (valgfrit – ellers fra i dag)</span><input id="closureFrom" type="date" value="${esc(c.from || '')}" /></label>
          <label class="afield"><span>Åbner igen den</span><input id="closureReopen" type="date" value="${esc(c.reopen || '')}" /></label>
          <label class="afield afield--full"><span>Besked til kunderne</span><textarea id="closureMessage" class="inline-input" rows="4" placeholder="fx Vi holder sommerferie og åbner igen mandag den 2. august. I er velkomne til at sende en forespørgsel.">${esc(c.message || '')}</textarea></label>
          <p class="sub" style="grid-column:1/-1;color:var(--ink-soft);">Beskeden vises automatisk som et flot ferie-kort øverst på hjemmesiden – både i god tid FØR lukkedagene og mens de står på. Den forsvinder af sig selv, når I åbner igen.</p>
        </div>
        <p class="sub" style="color:var(--ink-soft);margin-top:10px;">Mens ferien er aktiv, kan kunderne ikke bestille mad, men de kan stadig sende forespørgsler, booke møder og kontakte jer. Man kan godt forudbestille til dage efter I åbner igen.</p>
        <p class="sub" style="color:var(--ink-soft);margin-top:8px;">💡 <strong>Nemmeste vej:</strong> Brug <strong>🚫 Luk dage</strong>-knappen i kalenderen – dér kan I lukke en enkelt dag, flere perioder OG sætte ferie-beskeden på ét sted.</p>
        <button class="abtn abtn--ghost" data-goto="uge" style="margin-top:4px;">Åbn kalenderen →</button>
      </div>

      <div class="acard">
        <div class="acard__head">
          <h2>🕐 Åbningstider</h2>
          <span class="sub">alt gemmes automatisk, når du ændrer noget</span>
        </div>
        <p class="sub" style="color:var(--ink-soft);margin-bottom:16px;">Tiderne styrer også, hvilke afhentnings- og bookingtider kunderne kan vælge på hjemmesiden.</p>
        <div class="hoursrow" style="margin-bottom:8px;">
          <strong>🥡 To-go kan vælges</strong>
          <span class="sub" style="color:var(--ink-soft);font-size:0.85rem;">Sidste afhentningstid for to-go.</span>
          <div style="display:flex;align-items:center;gap:8px;">
            <input class="inline-input" id="orderFrom" type="time" value="${esc(S.getSettings().orderFrom || '16:00')}" />
            <span class="dash">–</span>
            <input class="inline-input" id="orderToTogo" type="time" value="${esc(S.getSettings().orderToTogo || '19:00')}" />
          </div>
          <span></span><span></span>
        </div>
        <div class="hoursrow" style="margin-bottom:14px;">
          <strong>🍽️ Spis her kan vælges</strong>
          <span class="sub" style="color:var(--ink-soft);font-size:0.85rem;">Køkkenet lukker for siddende gæster her (medmindre andet er aftalt).</span>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="sub" style="color:var(--ink-soft);">samme start</span>
            <span class="dash">–</span>
            <input class="inline-input" id="orderToDine" type="time" value="${esc(S.getSettings().orderToDine || '20:30')}" />
          </div>
          <span></span><span></span>
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

    /* auto-gem: enhver ændring (tider, kontakter, sidste bestillingstider) gemmes straks */
    function saveHours() {
      /* kun dag-rækkerne i .hoursgrid – de faste rækker ovenfor har ingen kontakt */
      const newHours = $$('#view-tider .hoursgrid .hoursrow').map((row) => {
        const closed = !$('[data-f="open-toggle"]', row).checked;
        return {
          closed,
          open: closed ? '' : $('[data-f="open"]', row).value,
          close: closed ? '' : $('[data-f="close"]', row).value,
        };
      });
      S.setHours(newHours);
      S.updateSettings({
        orderFrom: $('#orderFrom').value || '16:00',
        orderToTogo: $('#orderToTogo').value || '19:00',
        orderToDine: $('#orderToDine').value || '20:30',
      });
      savedToast();
    }
    $('#view-tider').onchange = () => saveHours();

    /* ferie / luk-periode – gemmer selv */
    function saveClosure() {
      S.setClosure({
        active: $('#closureActive').checked,
        from: $('#closureFrom').value || '',
        reopen: $('#closureReopen').value || '',
        message: $('#closureMessage').value.trim(),
      });
      savedToast();
    }
    $('#closureActive').addEventListener('change', () => {
      $('#closureFields').hidden = !$('#closureActive').checked;
      saveClosure();
    });
    $('#closureFrom').addEventListener('change', saveClosure);
    $('#closureReopen').addEventListener('change', saveClosure);
    $('#closureMessage').addEventListener('input', debounce(saveClosure, 800));

    /* nødbremsen – med en bekræftelse, så den aldrig rammes ved et uheld */
    $('#pausedMsg')?.addEventListener('input', debounce(() => {
      S.updateSettings({ ordersPausedMsg: $('#pausedMsg').value.trim() });
      savedToast();
    }, 800));
    $('#pauseToggle')?.addEventListener('click', () => {
      const nowOff = !S.getSettings().ordersPaused;
      if (nowOff && !confirm('Sluk for ALLE online bestillinger nu?\n\nKunderne kan ikke bestille, før I tænder igen.')) return;
      S.updateSettings({
        ordersPaused: nowOff,
        ordersPausedMsg: $('#pausedMsg').value.trim(),
      });
      renderHoursEditor();
      toast(nowOff ? '🛑 Online bestilling er slukket' : '🟢 Online bestilling er tændt igen');
    });
  }

  /* ============================================================
     INDSTILLINGER
     ============================================================ */
  function renderSettings() {
    const s = S.getSettings();
    $('#view-indstillinger').innerHTML = `
      <div class="acard">
        <div class="acard__head"><h2>⚙️ Kontaktoplysninger</h2><span class="sub">gemmes automatisk</span></div>
        <div class="formgrid" id="setGrid">
          <label class="afield"><span>Telefon</span><input id="setPhone" value="${esc(s.phone)}" /></label>
          <label class="afield"><span>E-mail</span><input id="setEmail" value="${esc(s.email)}" /></label>
          <label class="afield afield--full"><span>Adresse</span><input id="setAddress" value="${esc(s.address)}" /></label>
          <label class="afield afield--full"><span>Slogan</span><input id="setTagline" value="${esc(s.tagline)}" /></label>
        </div>
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

    /* auto-gem kontaktoplysninger, mens der skrives */
    const autosaveSettings = debounce(() => {
      S.updateSettings({
        phone: $('#setPhone').value.trim(),
        email: $('#setEmail').value.trim(),
        address: $('#setAddress').value.trim(),
        tagline: $('#setTagline').value.trim(),
      });
      savedToast();
    }, 900);
    $('#setGrid').addEventListener('input', autosaveSettings);

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
      closeDayModal();
      $(`.navitem[data-view="${goto.dataset.goto}"]`)?.click();
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const { act, id } = btn.dataset;

    if (act === 'goto-orders') {
      closeDayModal();
      ordersAllDays = false;
      ordersDate = btn.dataset.iso;
      $('.navitem[data-view="bestillinger"]')?.click();
      return;
    }

    if (act === 'kal-newbooking') {
      /* hop til Bookinger med formularen åben og datoen sat – arrangementer
         med "luk"-fluebenet blokerer automatisk dagen for madbestillinger */
      closeDayModal();
      switchView('bookinger');
      const fold = document.getElementById('newBookingFold');
      if (fold) { fold.open = true; fold.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      const dateEl = document.getElementById('nbkDate');
      if (dateEl) { dateEl.value = btn.dataset.iso; dateEl.dispatchEvent(new Event('change', { bubbles: true })); }
      document.getElementById('nbkName')?.focus({ preventScroll: true });
      toast(`Datoen ${S.formatDate(btn.dataset.iso)} er sat – udfyld resten og tryk Opret ✓`);
      return;
    }

    if (act === 'kal-lukdage') {
      openLukDialog(btn.dataset.iso);
      return;
    }

    if (act === 'kal-block') {
      S.blockDate(btn.dataset.iso);
      renderUge();
      refreshDayModal();
      toast(`${S.formatDate(btn.dataset.iso)} er nu lukket for bestilling og booking 🚫`);
      return;
    }
    if (act === 'kal-unblock') {
      S.unblockDate(btn.dataset.iso);
      renderUge();
      refreshDayModal();
      toast(`${S.formatDate(btn.dataset.iso)} er åben igen ✅`);
      return;
    }

    if (act === 'news-toggle') {
      const n = S.getNews().find((x) => x.id === id);
      if (n) { S.updateNews(id, { active: n.active === false }); renderNyheder(); }
      return;
    }
    if (act === 'news-del') {
      if (!confirm('Slet denne nyhed fra hjemmesiden?')) return;
      S.deleteNews(id);
      renderNyheder();
      return;
    }

    if (act === 'order-toggle') {
      const o = S.getOrders().find((x) => x.id === id);
      if (o) S.updateOrder(id, { status: o.status === 'ny' ? 'haandteret' : 'ny', read: true });
    }
    else if (act === 'row-more') {
      const række = btn.closest('.row');
      const p = række && række.querySelector('.row__danger');
      if (!p) return;
      p.hidden = !p.hidden;
      /* husk at den er foldet ud, så en automatisk opdatering midt i
         det hele ikke lukker den igen foran næsen på en */
      const rid = p.querySelector('[data-id]')?.dataset.id;
      if (rid) { if (p.hidden) aabneRaekker.delete(rid); else aabneRaekker.add(rid); }
      return; /* ingen gen-tegning – den ville folde panelet sammen igen */
    }
    else if (act === 'order-del') {
      /* sig HØJT hvad der forsvinder – navn, mad og dag. Så opdager man
         et fejltryk, inden en rigtig kundes bestilling er væk. */
      const o = S.getOrders().find((x) => x.id === id);
      bekraeftFarligt({
        titel: 'Slet denne bestilling?',
        linjer: o ? [
          o.name,
          foodLines(o).map((l) => `${l.qty} × ${l.name}`).join(', ') || 'ingen varer',
          `${S.formatDate(o.date)} kl. ${o.time || '?'} · 📞 ${o.phone || ''}`,
        ] : [],
        note: 'Bestillingen forsvinder for altid. Køkkenet kan ikke få den tilbage, og kunden får ingen besked.',
        knap: '🗑 Slet bestillingen',
      }).then((ja) => {
        if (!ja) return;
        S.deleteOrder(id);
        renderBell();
        renderListViews();
      });
      return;
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
      editor.hidden = true; /* luk editoren, så dag-vinduet kan vise det gemte */
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
    else if (act === 'booking-restore') {
      S.updateBooking(id, { status: 'ny', read: true });
      toast('Booking hentet tilbage – ligger nu under "Venter på jer" ↩');
    }
    else if (act === 'booking-del') {
      const bk = S.getBookings().find((x) => x.id === id);
      bekraeftFarligt({
        titel: 'Slet denne booking?',
        linjer: bk ? [
          bk.name,
          bk.subject || 'arrangement',
          `${bk.date ? S.formatDate(bk.date) : 'dato ikke fastlagt'}${bk.time ? ` kl. ${bk.time}` : ''} · 📞 ${bk.phone || ''}`,
        ] : [],
        note: 'Bookingen forsvinder for altid, og I kan ikke få den tilbage.',
        knap: '🗑 Slet bookingen',
      }).then((ja) => {
        if (!ja) return;
        S.deleteBooking(id);
        renderBell();
        renderListViews();
      });
      return;
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
  /* Er der "arbejde i gang", som en live-genopfriskning ville smadre?
     – en åben datovælger (måneds-bladring!), en åben rediger-editor,
       eller en halvt udfyldt "Opret booking selv"-formular */
  function editingInProgress(viewSel) {
    if (document.querySelector('.dp-pop:not([hidden])')) return true;
    if (document.querySelector(`${viewSel} .bkedit:not([hidden])`)) return true;
    const fold = document.getElementById('newBookingFold');
    if (fold && fold.open) {
      const val = (id) => { const el = document.getElementById(id); return el && el.value.trim(); };
      if (val('nbkName') || val('nbkPhone') || val('nbkDate') || val('nbkPersons') || val('nbkNote')) return true;
    }
    const el = document.activeElement;
    return !!(el && el.closest && el.closest(`${viewSel} textarea, ${viewSel} input, ${viewSel} select`));
  }

  function renderListViews() {
    if (activeView === 'overblik' && !editingInProgress('#view-overblik')) renderOverblik();
    if (activeView === 'bestillinger' && !editingInProgress('#view-bestillinger')) renderBestillinger();
    if (activeView === 'bookinger' && !editingInProgress('#view-bookinger')) renderBookinger();
    if (activeView === 'uge' && !editingInProgress('#view-uge')) renderUge();
    refreshDayModal(); /* dag-vinduet følger med, når data ændrer sig */
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
    /* aldrig lyd fra en gemt baggrundsfane – fx mens man kigger på hjemmesiden */
    if (document.visibilityState !== 'visible') return;
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

  /* Hvornår blev appen åbnet? Alt, der er oprettet FØR det tidspunkt,
     er pr. definition ikke nyt – uanset hvad appen lige har hentet.
     (2 minutters slæk, fordi telefonens ur og databasens ur ikke
     nødvendigvis er helt enige.) */
  const APP_AABNET = Date.now() - 2 * 60000;
  const oprettetEfterAabning = (x) => {
    if (!x.createdAt) return false;
    const t = new Date(x.createdAt).getTime();
    return Number.isFinite(t) && t >= APP_AABNET;
  };

  function liveAlerts() {
    const orders = S.getOrders();
    const bookings = S.getBookings();
    const ids = new Set([...orders.map((o) => 'o' + o.id), ...bookings.map((b) => 'b' + b.id)]);
    if (liveSeen === null) { liveSeen = ids; return; } /* første indlæsning = ikke nyt */
    /* To krav, ikke ét: den må ikke have været der før, OG den skal være
       oprettet mens appen var åben. Ellers kunne en tom cache eller en
       nyinstalleret app få gamle bestillinger til at plinge som nye. */
    const freshOrders = orders.filter((o) => !liveSeen.has('o' + o.id) && oprettetEfterAabning(o));
    const freshBookings = bookings.filter((b) => !liveSeen.has('b' + b.id) && oprettetEfterAabning(b));
    liveSeen = ids;
    if (!freshOrders.length && !freshBookings.length) return;
    const dayTxt = (o) => (o.date === S.todayISO() ? '' : ` · ${S.formatDate(o.date, false)}`);
    const first = freshOrders.length
      ? `🍲 Ny bestilling: ${freshOrders[0].name}${freshOrders[0].time ? ' · kl. ' + freshOrders[0].time : ''}${dayTxt(freshOrders[0])}`
      : `${freshBookings[0].kind === 'moede' ? '📅 Ny mødebooking' : '🎉 Ny arrangement-forespørgsel'}: ${freshBookings[0].subject}`;
    const extra = freshOrders.length + freshBookings.length - 1;
    toast(extra > 0 ? `${first} (+${extra} mere)` : first);
    ping();
  }

  /* databasen sagde nej – sig det højt, aldrig i stilhed */
  S.onWriteFail((hvad) => toast(`⚠️ ${hvad}. Tjek nettet og prøv igen.`, true));

  /* ============================================================
     ALDRIG EN GAMMEL APP I KØKKENET
     En telefon kan have appen liggende i sin cache og blive ved
     med at køre en gammel udgave – nye knapper og rettelser når
     aldrig frem. Vi tjekker versionsnummeret mod serveren og
     henter appen forfra, når den er blevet forældet.
     ============================================================ */
  (function versionsvagt() {
    const meta = document.querySelector('meta[name="spiis-version"]');
    const min = meta ? meta.content.trim() : '';
    /* '__V__' betyder at filen ikke er kommet gennem udgivelsen (lokal test) */
    if (!min || min.includes('__V__')) return;
    let fundet = null;

    /* vi henter kun forfra ÉN gang pr. version – ellers kunne appen
       ende i en løkke, hvis serveren et øjeblik svarer usammenhængende */
    const NØGLE = 'spiis_opdateret_til';
    const alleredePrøvet = (v) => sessionStorage.getItem(NØGLE) === v;
    const hent = (v) => {
      try { sessionStorage.setItem(NØGLE, v); } catch { /* privat browsing */ }
      location.replace(`${location.pathname}?v=${encodeURIComponent(v)}${location.hash}`);
    };
    /* er nogen midt i at skrive eller rette? så venter vi med at hoppe */
    const optaget = () => {
      const el = document.activeElement;
      if (el && el.closest && el.closest('input, textarea, select')) return true;
      if (document.querySelector('.dp-pop:not([hidden])')) return true;
      if (document.querySelector('.bkedit:not([hidden])')) return true;
      const dv = document.getElementById('dayModal');
      return !!(dv && !dv.hidden);
    };

    async function tjek() {
      if (fundet || document.visibilityState !== 'visible') return;
      try {
        const res = await fetch(`version.txt?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const ny = (await res.text()).trim();
        if (!ny || ny === min) return;
        fundet = ny;
        $('#updateBar').hidden = false;
        if (alleredePrøvet(ny)) {
          $('#updateSub').textContent = 'Tryk for at hente den – luk evt. appen helt og åbn igen';
          return;
        }
        const prøv = () => {
          if (optaget()) { $('#updateSub').textContent = 'Tryk her, når du er færdig'; return; }
          hent(ny);
        };
        setTimeout(prøv, 3000);
        setInterval(prøv, 15000);
      } catch { /* offline – vi prøver igen senere */ }
    }
    $('#updateNow').addEventListener('click', () => hent(fundet || Date.now()));
    document.addEventListener('visibilitychange', tjek);
    tjek();
    setInterval(tjek, 5 * 60 * 1000);
  })();

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
