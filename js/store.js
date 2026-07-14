/* ============================================================
   Spiis – fælles datalag
   Bruges af både hjemmesiden (index.html) og admin (admin.html).
   Data gemmes i localStorage og synkroniseres på tværs af faner
   via 'storage'-events, så nye bestillinger dukker op i admin
   med det samme.
   ============================================================ */

const SpiisStore = (() => {
  const KEY = 'spiis-data-v2';
  const listeners = new Set();

  /* ---------- dato-hjælpere (lokal tid, ikke UTC) ---------- */
  const pad = (n) => String(n).padStart(2, '0');

  function toISO(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  function fromISO(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function todayISO() {
    return toISO(new Date());
  }
  function addDays(iso, days) {
    const d = fromISO(iso);
    d.setDate(d.getDate() + days);
    return toISO(d);
  }
  /* 0 = mandag ... 6 = søndag */
  function weekdayIndex(iso) {
    return (fromISO(iso).getDay() + 6) % 7;
  }

  const WEEKDAYS = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
  const MONTHS = ['januar', 'februar', 'marts', 'april', 'maj', 'juni',
    'juli', 'august', 'september', 'oktober', 'november', 'december'];

  function formatDate(iso, withWeekday = true) {
    const d = fromISO(iso);
    const base = `${d.getDate()}. ${MONTHS[d.getMonth()]}`;
    return withWeekday ? `${WEEKDAYS[weekdayIndex(iso)]} d. ${base}` : base;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ---------- seed-data (demo-indhold, kan redigeres i admin) ---------- */
  const DISH_ROTATION = [
    { title: 'Boller i karry', desc: 'Hjemmerørte kødboller i cremet karrysauce med løse ris og æble.', price: 75 },
    { title: 'Stegt flæsk med persillesauce', desc: 'Sprødt flæsk, nye kartofler og klassisk persillesauce.', price: 85 },
    { title: 'Lasagne med grøn salat', desc: 'Hjemmelavet lasagne med langtidssimret kødsauce og frisk salat.', price: 75 },
    { title: 'Kylling i paprikagryde', desc: 'Mør kylling i paprikasauce med kartoffelmos og grønt.', price: 79 },
    { title: 'Krebinetter med stuvede ærter', desc: 'Sprøde krebinetter med stuvede ærter, gulerødder og kartofler.', price: 79 },
    { title: 'Pasta med kødsauce', desc: 'Frisk pasta med langtidssimret kødsauce og revet ost.', price: 69 },
    { title: 'Glaseret skinke med flødekartofler', desc: 'Honningglaseret skinke, cremede flødekartofler og salat.', price: 85 },
    { title: 'Fiskefilet med remoulade', desc: 'Sprødstegt fiskefilet med hjemmerørt remoulade, citron og kartofler.', price: 79 },
    { title: 'Gule ærter med tilbehør', desc: 'Klassiske gule ærter med kogt flæsk, pølse og rugbrød.', price: 75 },
    { title: 'Kylling i karry', desc: 'Mør kylling i mild karrysauce med ris og mangochutney.', price: 75 },
  ];

  function seed() {
    const data = {
      settings: {
        name: 'Spiis',
        tagline: 'Velsmag og kvalitet i hver en bid – nemt, hurtigt og altid en fornøjelse!',
        address: 'Karlslunde Idrætsforening, Kongens Enge 42, 2690 Karlslunde',
        phone: '93 99 58 58',
        email: 'spiis.bestilling@gmail.com',
        pin: '9399',
        kitchenClose: '20:30',
        togoLast: '19:30', /* sidste tidspunkt for to-go-bestillinger */
        dineLast: '20:30', /* sidste tidspunkt for spis her-bestillinger */
      },
      /* index 0 = mandag */
      hours: [
        { open: '16:00', close: '22:00', closed: false },
        { open: '16:00', close: '22:00', closed: false },
        { open: '16:00', close: '22:00', closed: false },
        { open: '16:00', close: '22:30', closed: false },
        { open: '16:00', close: '22:00', closed: false },
        { open: '16:00', close: '22:00', closed: false },
        { open: '16:00', close: '22:00', closed: false },
      ],
      dagensRet: {},   /* { 'YYYY-MM-DD': {title, desc, price} } */
      menu: {
        weekly: [[], [], [], [], [], [], []], /* ekstra retter pr. ugedag */
        categories: [
          {
            id: 'salater', name: 'Salater', availability: 'hverdage',
            items: [
              { name: 'Cæsar salat', desc: '', price: null },
              { name: 'Vegetarsalat', desc: '', price: null },
            ],
          },
          {
            id: 'retter', name: 'Retter', availability: 'hverdage',
            items: [
              { name: 'Spiis Burger', desc: 'Med to bøffer – i alt 250 g. Fås også som menu med sodavand, pommes og dip.', price: null },
              { name: 'Børneburger', desc: 'Som Spiis Burgeren, bare med én bøf på 125 g. Fås også som menu med sodavand, pommes og dip.', price: null },
              { name: 'Nachos med kylling', desc: '', price: null },
              { name: 'Pasta bolognese', desc: '', price: null },
            ],
          },
          {
            id: 'friture', name: 'Friture', availability: 'alle',
            items: [
              { name: 'Nuggets med pommes', desc: '', price: null },
              { name: 'Pommes frites', desc: 'Med eller uden dip.', price: null },
              { name: 'Chili cheese tops', desc: '', price: null },
              { name: 'Dip', desc: 'Ketchup, mayo, remoulade eller burgerdressing.', price: null },
            ],
          },
          {
            id: 'andet', name: 'Andet', availability: 'alle',
            items: [
              { name: 'Panini', desc: 'Med skinke og ost eller kylling og pesto.', price: null },
              { name: 'Stort hjemmelavet surdejsbrød', desc: '', price: 40 },
              { name: 'Halvt hjemmelavet surdejsbrød', desc: '', price: 25 },
            ],
          },
          {
            id: 'drikke', name: 'Drikkevarer', availability: 'alle',
            items: [
              { name: 'Sodavand', desc: 'Stort sortiment.', price: null },
              { name: 'Capri-Sun & juicebrik', desc: '', price: null },
              { name: 'Fadøl', desc: 'Rød Tuborg, Classic, Grøn Tuborg, Grimbergen og 1664 Blanc.', price: null },
              { name: 'Breezer & Somersby', desc: '', price: null },
              { name: 'Alkoholfri øl', desc: '', price: null },
              { name: 'Vin', desc: 'Rødvin, hvidvin og rosé.', price: null },
              { name: 'Snaps', desc: '', price: null },
            ],
          },
        ],
      },
      orders: [],       /* bestillinger af dagens ret */
      bookings: [],     /* arrangementer & møder */
      blockedDates: [], /* datoer chefen har lukket for booking */
      arrangementDates: [], /* dage med aftalt arrangement – blokeres automatisk for nye arrangement-forespørgsler */
      orderClosedDates: [], /* arrangement-dage hvor der OGSÅ er lukket for madbestillinger */
      notes: {},        /* chefens egne noter pr. dag { 'YYYY-MM-DD': tekst } */
      news: [],         /* nyheder på forsiden { id, title, text, image, cta, active, createdAt } */
      log: [],
    };

    /* Planlæg dagens ret 14 dage frem på åbne dage – 30 portioner pr. dag */
    let iso = todayISO();
    let dishIdx = 0;
    for (let i = 0; i < 14; i++) {
      const w = weekdayIndex(iso);
      if (!data.hours[w].closed) {
        data.dagensRet[iso] = { ...DISH_ROTATION[dishIdx % DISH_ROTATION.length], stock: 30 };
        dishIdx++;
      }
      iso = addDays(iso, 1);
    }
    return data;
  }

  /* ---------- load / save ---------- */
  let data;
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.settings) return null;
      /* blid migrering af felter, der er kommet til senere */
      if (!parsed.notes) parsed.notes = {};
      if (!parsed.arrangementDates) parsed.arrangementDates = [];
      if (!parsed.orderClosedDates) parsed.orderClosedDates = [];
      if (!parsed.news) parsed.news = [];
      return parsed;
    } catch {
      return null;
    }
  }
  function save(emitEvent = true) {
    localStorage.setItem(KEY, JSON.stringify(data));
    if (emitEvent) emit();
  }
  function emit() {
    listeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
  }

  data = load() || seed();
  save(false);

  /* Synkronisér på tværs af faner (kunde bestiller -> admin opdaterer) */
  window.addEventListener('storage', (e) => {
    if (e.key === KEY && e.newValue) {
      try {
        data = JSON.parse(e.newValue);
        emit();
      } catch { /* ignore */ }
    }
  });

  /* ============================================================
     SKY – fælles database via Supabase (js/config.js).
     Aktiveres automatisk, når databasen svarer; ellers kører alt
     lokalt i browseren som hidtil. Menu/tider/dagens ret læses af
     alle; bestillinger og bookinger kan alle OPRETTE, men kun
     chefen (login) kan læse og ændre dem.
     ============================================================ */
  const CLOUD = (typeof window !== 'undefined' && window.SPIIS_CLOUD && window.SPIIS_CLOUD.url)
    ? window.SPIIS_CLOUD : null;
  const SES_KEY = 'spiis-sb-session';
  let cloud = false;
  let cloudReady = null;
  let soldByDate = {}; /* { 'YYYY-MM-DD': solgte kuverter } fra get_sold */
  let session = null;
  try { session = JSON.parse(localStorage.getItem(SES_KEY) || 'null'); } catch { session = null; }

  async function sbFetch(path, { method = 'GET', body, headers = {}, auth = false, retry = true } = {}) {
    const h = {
      apikey: CLOUD.anonKey,
      'Content-Type': 'application/json',
      ...headers,
    };
    /* Authorization: brugerens token når logget ind. For anonyme kald
       sendes nøglen kun som Bearer, hvis den er en legacy-JWT ("eyJ…");
       nye publishable-nøgler (sb_publishable_…) må kun stå i apikey. */
    if (auth && session) {
      h.Authorization = `Bearer ${session.access_token}`;
    } else if (CLOUD.anonKey.startsWith('eyJ')) {
      h.Authorization = `Bearer ${CLOUD.anonKey}`;
    }
    const res = await fetch(CLOUD.url + path, { method, headers: h, body });
    if (res.status === 401 && auth && retry && session && session.refresh_token) {
      if (await refreshSession()) return sbFetch(path, { method, body, headers, auth, retry: false });
    }
    return res;
  }

  const CONFIG_KEYS = ['settings', 'hours', 'dagensRet', 'menu', 'blockedDates', 'arrangementDates', 'orderClosedDates', 'news'];

  function mergeConfig(remote) {
    if (!remote) return;
    CONFIG_KEYS.forEach((k) => {
      if (remote[k] != null) data[k] = remote[k];
    });
    /* pin bruges kun lokalt og ligger aldrig i skyen */
    if (!data.settings.pin) data.settings.pin = '9399';
  }

  function configSlice() {
    const { pin, ...settings } = data.settings;
    return {
      settings,
      hours: data.hours,
      dagensRet: data.dagensRet,
      menu: data.menu,
      blockedDates: data.blockedDates,
      arrangementDates: data.arrangementDates || [],
      orderClosedDates: data.orderClosedDates || [],
      news: data.news || [],
    };
  }

  function pushConfig() {
    if (!cloud) return;
    sbFetch('/rest/v1/config?id=eq.1', {
      method: 'PATCH',
      auth: true,
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ data: configSlice() }),
    }).then((res) => {
      if (!res.ok) console.error('Spiis: kunne ikke gemme i skyen (' + res.status + ')');
    }).catch(() => console.error('Spiis: netværksfejl ved gem i skyen'));
  }

  /* databasen bruger descr/created_at – js bruger desc/createdAt */
  const rowToOrder = (r) => ({ ...r, createdAt: r.created_at });
  const rowToBooking = (r) => ({ ...r, desc: r.descr, createdAt: r.created_at });

  /* spring gen-tegning over, når polling ikke bragte nyt – ellers
     genopbygges siden hvert minut uden grund */
  let lastPublicSnap = '';
  async function refreshPublic() {
    if (!cloud) return;
    try {
      const [cfgRes, soldRes] = await Promise.all([
        sbFetch('/rest/v1/config?id=eq.1&select=data'),
        sbFetch('/rest/v1/rpc/get_sold', { method: 'POST', body: '{}' }),
      ]);
      let remoteCfg = null;
      if (cfgRes.ok) {
        const rows = await cfgRes.json();
        if (rows[0]) remoteCfg = rows[0].data;
      }
      let remoteSold = null;
      if (soldRes.ok) remoteSold = await soldRes.json();

      const snap = JSON.stringify([remoteCfg, remoteSold]);
      if (snap === lastPublicSnap) return;
      lastPublicSnap = snap;

      if (remoteCfg) mergeConfig(remoteCfg);
      if (remoteSold) {
        soldByDate = {};
        remoteSold.forEach((r) => { soldByDate[r.date] = Number(r.sold) || 0; });
      }
      save(false);
      emit();
    } catch { /* prøver igen ved næste opdatering */ }
  }

  /* Hent alle rækker sidevist – databasen leverer højst 1000 pr. kald,
     så på travle dage (50+ bestillinger) skal der blades. */
  async function sbRows(basePath, auth = true) {
    const rows = [];
    for (let pageIdx = 0; pageIdx < 10; pageIdx++) {
      const from = pageIdx * 1000;
      const res = await sbFetch(basePath, {
        auth,
        headers: { 'Range-Unit': 'items', Range: `${from}-${from + 999}` },
      });
      if (!res.ok) throw new Error('fetch ' + res.status);
      const page = await res.json();
      rows.push(...page);
      if (page.length < 1000) break;
    }
    return rows;
  }

  let lastAdminSnap = '';
  async function fetchAdminData() {
    if (!cloud || !session) return;
    /* bestillinger fra de seneste 60 dage – rigeligt til ugeoverblik og
       tilbageblik, og holder mængden nede når der er drift hver dag */
    const ordersFrom = addDays(todayISO(), -60);
    const [orders, bookings, notes] = await Promise.all([
      sbRows(`/rest/v1/orders?select=*&date=gte.${ordersFrom}&order=created_at.asc`),
      sbRows('/rest/v1/bookings?select=*&order=created_at.asc'),
      sbRows('/rest/v1/notes?select=*'),
    ]);
    const snap = JSON.stringify([orders, bookings, notes]);
    if (snap === lastAdminSnap) return;
    lastAdminSnap = snap;
    data.orders = orders.map(rowToOrder);
    data.bookings = bookings.map(rowToBooking);
    data.notes = {};
    notes.forEach((r) => { data.notes[r.date] = r.text; });
    /* ubekræftede lokale ændringer vinder over den hentede øjebliksstatus */
    applyPending();
    save(false);
    emit();
  }

  async function refreshSession() {
    try {
      const res = await fetch(`${CLOUD.url}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { apikey: CLOUD.anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      if (!res.ok) throw new Error();
      const out = await res.json();
      session = { access_token: out.access_token, refresh_token: out.refresh_token, email: out.user && out.user.email };
      localStorage.setItem(SES_KEY, JSON.stringify(session));
      if (rtClient) { try { rtClient.realtime.setAuth(session.access_token); } catch { /* ignorér */ } }
      return true;
    } catch {
      session = null;
      localStorage.removeItem(SES_KEY);
      emit();
      return false;
    }
  }

  async function adminLogin(email, password) {
    if (cloudReady) await cloudReady;
    if (!cloud) return { ok: false, msg: 'Databasen svarer ikke – prøv igen om lidt.' };
    try {
      const res = await fetch(`${CLOUD.url}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: CLOUD.anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.access_token) {
        return { ok: false, msg: 'Forkert e-mail eller adgangskode.' };
      }
      session = { access_token: out.access_token, refresh_token: out.refresh_token, email: out.user && out.user.email };
      localStorage.setItem(SES_KEY, JSON.stringify(session));
      await fetchAdminData().catch(() => {});
      return { ok: true };
    } catch {
      return { ok: false, msg: 'Netværksfejl – tjek forbindelsen og prøv igen.' };
    }
  }

  function logout() {
    session = null;
    localStorage.removeItem(SES_KEY);
  }

  const isCloud = () => cloud;
  let cloudDown = false; /* databasen er sat op, men svarer ikke */
  const isCloudConfigured = () => !!CLOUD;
  const isCloudDown = () => cloudDown;
  const hasSession = () => !!(session && session.access_token);

  let adminPollTimer = null;
  let lastWake = 0;
  function wakeRefresh() {
    /* hent ALT med det samme – men højst hvert 3. sekund */
    if (Date.now() - lastWake < 3000) return;
    lastWake = Date.now();
    fetchAdminData().catch(() => {});
    refreshPublic();
  }
  /* ---------- realtime: nye bestillinger/bookinger lander ØJEBLIKKELIGT ----------
     Kræver supabase-js (indlæses kun i admin) og at tabellerne er meldt
     til i databasen (update-9). Polling kører altid som sikkerhedsnet. */
  let rtClient = null;
  function startRealtime() {
    if (rtClient || !cloud || !session || typeof window === 'undefined' || !window.supabase) return;
    try {
      rtClient = window.supabase.createClient(CLOUD.url, CLOUD.anonKey);
      rtClient.realtime.setAuth(session.access_token);
      let t = null;
      const kick = () => {
        clearTimeout(t);
        t = setTimeout(() => { fetchAdminData().catch(() => {}); refreshPublic(); }, 350);
      };
      rtClient.channel('spiis-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, kick)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, kick)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'config' }, kick)
        .subscribe();
    } catch { rtClient = null; /* realtime er en bonus – polling dækker */ }
  }

  function startAdminPolling() {
    if (!cloud || adminPollTimer) return;
    startRealtime();
    adminPollTimer = setInterval(() => {
      fetchAdminData().catch(() => {});
      /* menukortet (fx "få tilbage"-antal, der tæller ned) skal også følge med */
      refreshPublic();
    }, 10000);
    /* telefonen fryser appen i baggrunden – hent friske data i SAMME
       sekund den åbnes igen, i stedet for at vente på næste tjek */
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) wakeRefresh();
    });
    window.addEventListener('focus', wakeRefresh);
    window.addEventListener('pageshow', wakeRefresh);
    window.addEventListener('online', wakeRefresh);
  }

  function initCloud() {
    if (!CLOUD) return;
    cloudReady = (async () => {
      try {
        const res = await sbFetch('/rest/v1/config?id=eq.1&select=data');
        if (!res.ok) throw new Error();
        cloud = true;
        /* i sky-tilstand ejes bestillinger/bookinger/noter af databasen */
        data.orders = [];
        data.bookings = [];
        data.notes = {};
        const rows = await res.json();
        if (rows[0]) mergeConfig(rows[0].data);
        await refreshPublic();
        if (hasSession()) await fetchAdminData().catch(() => {});
        save(false);
        emit();
        setInterval(refreshPublic, 60000);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            refreshPublic();
            if (hasSession()) fetchAdminData().catch(() => {});
          }
        });
      } catch {
        /* databasen svarer ikke – kør lokalt og lad siderne vise besked */
        cloud = false;
        cloudDown = true;
        emit();
      }
    })();
  }
  initCloud();

  /* ---------- settings & åbningstider ---------- */
  const getSettings = () => ({ ...data.settings });
  function updateSettings(patch) {
    data.settings = { ...data.settings, ...patch };
    save();
    pushConfig();
  }
  const getHours = () => data.hours.map((h) => ({ ...h }));
  function setHours(hours) {
    data.hours = hours;
    save();
    pushConfig();
  }
  function hoursFor(iso) {
    return data.hours[weekdayIndex(iso)];
  }
  function isOpenDay(iso) {
    return !hoursFor(iso).closed;
  }

  /* ---------- dagens ret ---------- */
  const getDagensRet = (iso) => (data.dagensRet[iso] ? { ...data.dagensRet[iso] } : null);
  function setDagensRet(iso, dish) {
    if (dish && dish.title) data.dagensRet[iso] = dish;
    else delete data.dagensRet[iso];
    save();
    pushConfig();
  }
  /* De næste `days` dage med dato, ugedag, ret og åben/lukket */
  function getPlan(days = 7, fromIso = todayISO()) {
    const plan = [];
    let iso = fromIso;
    for (let i = 0; i < days; i++) {
      plan.push({
        iso,
        weekday: WEEKDAYS[weekdayIndex(iso)],
        dish: getDagensRet(iso),
        open: isOpenDay(iso),
      });
      iso = addDays(iso, 1);
    }
    return plan;
  }

  /* ---------- menukort ---------- */
  const getMenu = () => JSON.parse(JSON.stringify(data.menu));
  function setMenu(menu) {
    data.menu = menu;
    save();
    pushConfig();
  }

  /* ---------- lager for dagens ret ---------- */
  function getSold(iso) {
    const local = data.orders
      .filter((o) => o.date === iso)
      .reduce((sum, o) => sum + Number(o.qty || 0), 0);
    /* på kundesiden i sky-tilstand kommer tallet fra get_sold */
    return cloud ? Math.max(local, soldByDate[iso] || 0) : local;
  }
  /* null = intet loft sat; ellers antal portioner tilbage (kan ikke gå under 0) */
  function getRemaining(iso) {
    const dish = data.dagensRet[iso];
    if (!dish || dish.stock == null || dish.stock === '') return null;
    return Math.max(0, Number(dish.stock) - getSold(iso));
  }

  /* varer, chefen har markeret som udsolgt på menukortet */
  function soldoutNames() {
    const set = new Set();
    ((data.menu && data.menu.categories) || []).forEach((c) =>
      (c.items || []).forEach((i) => { if (i.soldout && i.name) set.add(i.name); }));
    return set;
  }
  function findMenuItem(name) {
    for (const c of ((data.menu && data.menu.categories) || [])) {
      const hit = (c.items || []).find((i) => i.name === name);
      if (hit) return hit;
    }
    return null;
  }

  /* ---------- bestillinger (kurv med dagens ret + menukort) ---------- */
  async function addOrder(order) {
    /* dage med privat arrangement (eller lukkede dage) tager ikke imod bestillinger */
    if (isOrderingClosed(order.date)) return { ok: false, reason: 'lukket' };
    /* to-go senest kl. 19:30, spis her senest kl. 20:30 (kan ændres i admin) */
    const lastTime = order.type === 'togo'
      ? (data.settings.togoLast || '19:30')
      : (data.settings.dineLast || '20:30');
    if (order.time && order.time > lastTime) return { ok: false, reason: 'tid' };
    /* udsolgte varer og "få tilbage"-antal stoppes før afsendelse
       – databasen tjekker og tæller også selv (kapløbs-sikkert) */
    const soldout = soldoutNames();
    for (const l of (order.items || [])) {
      if (l.kind === 'dagensret') continue;
      if (soldout.has(l.name)) return { ok: false, reason: 'udsolgt', item: l.name };
      const mi = findMenuItem(l.name);
      if (mi && mi.left != null && Number(l.qty) > Number(mi.left)) {
        return { ok: false, reason: 'antal', item: l.name, remaining: Math.max(0, Number(mi.left)) };
      }
    }
    if (cloud) {
      /* lagertjekket (kun dagens ret) sker atomisk i databasen */
      try {
        const res = await sbFetch('/rest/v1/rpc/place_order', {
          method: 'POST',
          body: JSON.stringify({
            p_date: order.date, p_time: order.time, p_qty: order.qty, p_type: order.type,
            p_name: order.name, p_phone: order.phone, p_note: order.note || '',
            p_dish: order.dish || '', p_price: order.price,
            p_items: order.items || [], p_persons: order.persons || null,
          }),
        });
        if (!res.ok) throw new Error();
        const out = await res.json();
        if (out.ok) {
          soldByDate[order.date] = (soldByDate[order.date] || 0) + Number(order.qty);
          emit();
          /* databasen har talt "få tilbage" ned – hent det friske menukort */
          lastPublicSnap = '';
          refreshPublic();
        }
        return out;
      } catch {
        return { ok: false, error: 'net' };
      }
    }
    const remaining = getRemaining(order.date);
    if (remaining !== null && Number(order.qty) > remaining) {
      return { ok: false, remaining };
    }
    /* tæl "få tilbage" ned – rammer den 0, bliver retten selv UDSOLGT */
    (order.items || []).forEach((l) => {
      if (l.kind === 'dagensret') return;
      const mi = findMenuItem(l.name);
      if (mi && mi.left != null) {
        mi.left = Math.max(0, Number(mi.left) - Number(l.qty));
        if (mi.left <= 0) { mi.soldout = true; mi.left = null; }
      }
    });
    const entry = {
      id: uid(),
      createdAt: new Date().toISOString(),
      status: 'ny',
      read: false,
      ...order,
    };
    data.orders.push(entry);
    save();
    return { ok: true, order: entry };
  }
  function getOrders(dateIso = null) {
    let list = data.orders.slice();
    if (dateIso) list = list.filter((o) => o.date === dateIso);
    return list.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  }
  /* Lokale ændringer (fx "✓ Færdig") må ikke overskrives af en
     samtidig hentning, før databasen har bekræftet dem – ellers
     kan rækken "blinke" frem og tilbage. */
  const pendingOps = [];
  function notePending(table, id, patch) {
    const op = { table, id, patch, until: Date.now() + 15000 };
    pendingOps.push(op);
    return op;
  }
  function donePending(op) {
    /* Bekræftet i databasen: hold ændringen i et lille nådevindue,
       så en hentning, der allerede var i gang, ikke ruller den tilbage. */
    op.until = Date.now() + 5000;
  }
  function applyPending() {
    const now = Date.now();
    for (let i = pendingOps.length - 1; i >= 0; i--) {
      const op = pendingOps[i];
      if (op.until < now) { pendingOps.splice(i, 1); continue; }
      if (op.patch === null) {
        data[op.table] = data[op.table].filter((x) => x.id !== op.id);
      } else {
        const row = data[op.table].find((x) => x.id === op.id);
        if (row) Object.assign(row, op.patch);
      }
    }
  }

  function updateOrder(id, patch) {
    const o = data.orders.find((x) => x.id === id);
    if (!o) return;
    Object.assign(o, patch);
    save();
    if (cloud) {
      const op = notePending('orders', id, patch);
      sbFetch(`/rest/v1/orders?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', auth: true, headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(patch),
      }).then((res) => { if (res.ok) donePending(op); }).catch(() => {});
    }
  }
  function deleteOrder(id) {
    data.orders = data.orders.filter((x) => x.id !== id);
    save();
    if (cloud) {
      const op = notePending('orders', id, null);
      sbFetch(`/rest/v1/orders?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', auth: true })
        .then((res) => { if (res.ok) donePending(op); }).catch(() => {});
    }
  }

  /* ---------- bookinger (arrangementer & møder) ---------- */
  async function addBooking(booking) {
    if (cloud) {
      try {
        const res = await sbFetch('/rest/v1/bookings', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify([{
            kind: booking.kind, subject: booking.subject, descr: booking.desc || '',
            date: booking.date || null, time: booking.time || '', name: booking.name,
            phone: booking.phone, email: booking.email || '',
          }]),
        });
        if (!res.ok) throw new Error();
        return { ok: true };
      } catch {
        return { ok: false, error: 'net' };
      }
    }
    const entry = {
      id: uid(),
      createdAt: new Date().toISOString(),
      status: 'ny',
      read: false,
      ...booking,
    };
    data.bookings.push(entry);
    save();
    return { ok: true, booking: entry };
  }
  function getBookings() {
    return data.bookings.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }
  function updateBooking(id, patch) {
    const b = data.bookings.find((x) => x.id === id);
    if (!b) return;
    Object.assign(b, patch);
    save();
    if (cloud) {
      const op = notePending('bookings', id, patch);
      sbFetch(`/rest/v1/bookings?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', auth: true, headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(patch),
      }).then((res) => {
        if (res.ok) { donePending(op); return; }
        /* kender databasen ikke block_orders-kolonnen endnu (SQL ikke kørt),
           gemmes resten af ændringen alligevel – intet må gå tabt */
        if ('block_orders' in patch) {
          const { block_orders, ...rest } = patch;
          if (Object.keys(rest).length) {
            sbFetch(`/rest/v1/bookings?id=eq.${encodeURIComponent(id)}`, {
              method: 'PATCH', auth: true, headers: { Prefer: 'return=minimal' },
              body: JSON.stringify(rest),
            }).then((r2) => { if (r2.ok) donePending(op); }).catch(() => {});
          }
        }
      }).catch(() => {});
    }
    syncArrangementDates();
  }
  function deleteBooking(id) {
    data.bookings = data.bookings.filter((x) => x.id !== id);
    save();
    if (cloud) {
      const op = notePending('bookings', id, null);
      sbFetch(`/rest/v1/bookings?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', auth: true })
        .then((res) => { if (res.ok) donePending(op); }).catch(() => {});
    }
    syncArrangementDates();
  }

  /* Dage med et aftalt arrangement blokeres automatisk for nye
     arrangement-forespørgsler på hjemmesiden – og som udgangspunkt
     lukkes der også for madbestillinger, medmindre chefen har
     fjernet fluebenet (små arrangementer, hvor Spiis holder åbent).
     Listerne genberegnes ved hver ændring, så de også rydder op,
     når et arrangement afvises, slettes eller flyttes. */
  function syncArrangementDates() {
    const confirmed = data.bookings.filter((b) =>
      b.kind === 'arrangement' && b.status === 'bekraeftet' && b.date && b.date >= todayISO());
    const arrDates = [...new Set(confirmed.map((b) => b.date))].sort();
    const closedDates = [...new Set(
      confirmed.filter((b) => b.block_orders !== false).map((b) => b.date)
    )].sort();
    if (JSON.stringify(arrDates) !== JSON.stringify(data.arrangementDates || [])
        || JSON.stringify(closedDates) !== JSON.stringify(data.orderClosedDates || [])) {
      data.arrangementDates = arrDates;
      data.orderClosedDates = closedDates;
      save();
      pushConfig();
    }
  }

  /* ---------- push-notifikationer (admin-appen) ----------
     Abonnementet fra browseren gemmes i databasen, så Supabase
     kan sende push, når der kommer nye bestillinger/bookinger. */
  async function savePushSubscription(sub) {
    if (!cloud) return { ok: false };
    try {
      const s = sub.toJSON ? sub.toJSON() : sub;
      const res = await sbFetch('/rest/v1/push_subscriptions?on_conflict=endpoint', {
        method: 'POST', auth: true,
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([{ endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth }]),
      });
      return { ok: res.ok };
    } catch { return { ok: false }; }
  }
  async function deletePushSubscription(endpoint) {
    if (!cloud) return;
    sbFetch(`/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
      method: 'DELETE', auth: true,
    }).catch(() => {});
  }

  /* ---------- tilgængelighed for booking ---------- */
  const getBlockedDates = () => data.blockedDates.slice();
  const getArrangementDates = () => (data.arrangementDates || []).slice();

  /* manuelt lukkede dage – og arrangement-dage hvor chefen har valgt
     at lukke – tager ikke imod almindelige madbestillinger */
  const isOrderingClosed = (iso) =>
    data.blockedDates.includes(iso) || (data.orderClosedDates || []).includes(iso);
  function blockDate(iso) {
    if (!data.blockedDates.includes(iso)) {
      data.blockedDates.push(iso);
      data.blockedDates.sort();
      save();
      pushConfig();
    }
  }
  function unblockDate(iso) {
    data.blockedDates = data.blockedDates.filter((d) => d !== iso);
    save();
    pushConfig();
  }
  function isDateAvailable(iso, kind) {
    if (!iso || iso < todayISO()) return { ok: false, reason: 'Datoen er passeret.' };
    if (!isOpenDay(iso)) return { ok: false, reason: 'Vi holder lukket denne dag.' };
    if (data.blockedDates.includes(iso)) return { ok: false, reason: 'Dagen er desværre optaget – vælg en anden dag.' };
    /* dage med et aftalt arrangement er kun lukket for NYE arrangementer – møder kan stadig bookes */
    if (kind !== 'moede' && (data.arrangementDates || []).includes(iso)) {
      return { ok: false, reason: 'Dagen er allerede optaget af et arrangement – vælg en anden dag.' };
    }
    return { ok: true, reason: 'Dagen er ledig!' };
  }

  /* ---------- tidsintervaller ud fra åbningstider ----------
     useKitchenClose: true for madbestillinger, så tiderne stopper
     ved køkkenets lukketid i stedet for stedets lukketid. */
  function timeslotsFor(iso, stepMinutes = 30, useKitchenClose = false, maxTime = null) {
    const h = hoursFor(iso);
    if (h.closed || !h.open || !h.close) return [];
    const toMin = (hhmm) => {
      const [hh, mm] = hhmm.split(':').map(Number);
      return hh * 60 + mm;
    };
    let end = toMin(h.close);
    const kitchen = data.settings.kitchenClose;
    if (useKitchenClose && kitchen) end = Math.min(end, toMin(kitchen));
    if (maxTime) end = Math.min(end, toMin(maxTime));
    const slots = [];
    let t = toMin(h.open);
    while (t <= end) {
      slots.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
      t += stepMinutes;
    }
    return slots;
  }

  /* ---------- chefens dagsnoter ---------- */
  const getNote = (iso) => data.notes[iso] || '';
  function setNote(iso, text) {
    if (text && text.trim()) data.notes[iso] = text;
    else delete data.notes[iso];
    save();
    if (cloud) {
      if (text && text.trim()) {
        sbFetch('/rest/v1/notes', {
          method: 'POST', auth: true,
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify([{ date: iso, text }]),
        }).catch(() => {});
      } else {
        sbFetch(`/rest/v1/notes?date=eq.${iso}`, { method: 'DELETE', auth: true }).catch(() => {});
      }
    }
  }

  /* ---------- uge-hjælpere ---------- */
  /* mandagen i den uge, som iso ligger i */
  function weekStart(iso) {
    return addDays(iso, -weekdayIndex(iso));
  }
  function weekNumber(iso) {
    const d = fromISO(iso);
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
    const week1 = new Date(t.getFullYear(), 0, 4);
    return 1 + Math.round(((t - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  }

  /* ---------- notifikationer ---------- */
  function getUnread() {
    const orders = data.orders.filter((o) => !o.read);
    const bookings = data.bookings.filter((b) => !b.read);
    return { orders, bookings, count: orders.length + bookings.length };
  }
  function markAllRead() {
    data.orders.forEach((o) => { o.read = true; });
    data.bookings.forEach((b) => { b.read = true; });
    save();
    if (cloud) {
      sbFetch('/rest/v1/orders?read=eq.false', {
        method: 'PATCH', auth: true, headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ read: true }),
      }).catch(() => {});
      sbFetch('/rest/v1/bookings?read=eq.false', {
        method: 'PATCH', auth: true, headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ read: true }),
      }).catch(() => {});
    }
  }

  /* ---------- nyheder på forsiden ---------- */
  const getNews = () => (data.news || []).slice()
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  function addNews(post) {
    const entry = { id: uid(), createdAt: new Date().toISOString(), active: true, ...post };
    data.news = [entry, ...(data.news || [])];
    save();
    pushConfig();
    return entry;
  }
  function updateNews(id, patch) {
    const n = (data.news || []).find((x) => x.id === id);
    if (!n) return;
    Object.assign(n, patch);
    save();
    pushConfig();
  }
  function deleteNews(id) {
    data.news = (data.news || []).filter((x) => x.id !== id);
    save();
    pushConfig();
  }

  /* kunden bestiller en special direkte fra en nyhed (fx juleplatter).
     Ordren lander i den ALMINDELIGE orders-tabel som en 'nyhed'-vare, så den
     dukker op i køreplanen og tælles i kalenderen ligesom alt andet – ingen huller. */
  async function placeNewsOrder(newsId, o) {
    const news = (data.news || []).find((n) => n.id === newsId);
    if (!news) return { ok: false, reason: 'findes-ikke' };
    if (!news.orderable) return { ok: false, reason: 'ikke-bestilbar' };
    if (news.active === false) return { ok: false, reason: 'ikke-aktiv' };
    const qty = Number(o.qty);
    if (!qty || qty < 1) return { ok: false, reason: 'antal' };
    if (!o.name || !o.phone) return { ok: false, reason: 'mangler' };
    if (!o.date || o.date < todayISO()) return { ok: false, reason: 'dato' };
    if (news.orderBy && todayISO() > news.orderBy) return { ok: false, reason: 'deadline' };
    if (cloud) {
      try {
        const res = await sbFetch('/rest/v1/rpc/place_news_order', {
          method: 'POST',
          body: JSON.stringify({
            p_news_id: newsId, p_date: o.date, p_qty: qty,
            p_name: o.name, p_phone: o.phone, p_note: o.note || '',
          }),
        });
        if (!res.ok) throw new Error();
        const out = await res.json();
        if (out.ok) { emit(); lastPublicSnap = ''; refreshPublic(); }
        return out;
      } catch {
        return { ok: false, error: 'net' };
      }
    }
    /* lokal demo-tilstand */
    if (news.orderMax != null && news.orderMax !== '') {
      const sold = (data.orders || []).reduce((s, ord) =>
        s + (ord.items || []).filter((i) => i.news_id === newsId).reduce((a, i) => a + Number(i.qty), 0), 0);
      if (sold + qty > Number(news.orderMax)) {
        return { ok: false, reason: 'antal', remaining: Math.max(0, Number(news.orderMax) - sold) };
      }
    }
    const entry = {
      id: uid(), createdAt: new Date().toISOString(), status: 'ny', read: false,
      date: o.date, time: '', qty: 0, type: 'togo', name: o.name, phone: o.phone,
      note: o.note || '', dish: '', price: null, persons: qty,
      items: [{ name: news.title, qty, kind: 'nyhed', price: news.price ?? null, news_id: newsId }],
    };
    data.orders.push(entry);
    save();
    return { ok: true, order: entry };
  }
  /* finpudser billedet automatisk med fal.ai (Nano Banana Pro) via vores
     edge function – nøglen ligger som hemmelighed i Supabase, aldrig i koden.
     Fejler eller er den langsom, bruger vi bare originalen (returnerer ok:false). */
  /* skal matche navnet på edge-funktionen i Supabase (Edge Functions) */
  const ENHANCE_FN = 'super-function';
  async function enhanceNewsImage(imageUrl) {
    if (!cloud || !session || !imageUrl) return { ok: false, error: 'local' };
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 60000);
      const res = await fetch(`${CLOUD.url}/functions/v1/${ENHANCE_FN}`, {
        method: 'POST',
        headers: {
          apikey: CLOUD.anonKey,
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageUrl }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const out = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, httpStatus: res.status, error: out.error || 'http', status: out.status, detail: out.detail };
      return out && out.ok && out.url
        ? { ok: true, url: out.url }
        : { ok: false, error: out.error || 'unknown', status: out.status, detail: out.detail };
    } catch (e) {
      return { ok: false, error: 'network', detail: String(e) };
    }
  }

  /* billedet lægges i Supabase Storage (bucket "nyheder"), så config-rækken
     forbliver lille – hjemmesiden henter den jo hele tiden */
  async function uploadNewsImage(blob, name) {
    if (!cloud || !session) return { ok: false };
    const safe = (name || 'billede.jpg').toLowerCase().replace(/[^a-z0-9.]+/g, '-').slice(-60);
    const path = `${Date.now().toString(36)}-${safe}`;
    try {
      const res = await fetch(`${CLOUD.url}/storage/v1/object/nyheder/${path}`, {
        method: 'POST',
        headers: {
          apikey: CLOUD.anonKey,
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': blob.type || 'image/jpeg',
          'x-upsert': 'true',
        },
        body: blob,
      });
      if (!res.ok) return { ok: false };
      return { ok: true, url: `${CLOUD.url}/storage/v1/object/public/nyheder/${path}` };
    } catch {
      return { ok: false };
    }
  }

  /* ---------- eksport / nulstil ---------- */
  const exportData = () => JSON.stringify(data, null, 2);
  function resetData() {
    data = seed();
    save();
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  return {
    WEEKDAYS, MONTHS,
    todayISO, addDays, weekdayIndex, formatDate, toISO, fromISO,
    getSettings, updateSettings,
    getHours, setHours, hoursFor, isOpenDay,
    getDagensRet, setDagensRet, getPlan,
    getSold, getRemaining,
    getNote, setNote, weekStart, weekNumber,
    getMenu, setMenu,
    addOrder, getOrders, updateOrder, deleteOrder,
    addBooking, getBookings, updateBooking, deleteBooking,
    getBlockedDates, getArrangementDates, isOrderingClosed, blockDate, unblockDate, isDateAvailable,
    timeslotsFor,
    getNews, addNews, updateNews, deleteNews, uploadNewsImage, enhanceNewsImage, placeNewsOrder,
    getUnread, markAllRead,
    exportData, resetData,
    subscribe,
    /* sky */
    isCloud, isCloudConfigured, isCloudDown,
    hasSession, adminLogin, logout, startAdminPolling,
    refreshAdmin: fetchAdminData, refreshPublic,
    savePushSubscription, deletePushSubscription,
  };
})();
