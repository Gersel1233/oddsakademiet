/* ============================================================
   Spiis – fælles datalag
   Bruges af både hjemmesiden (index.html) og admin (admin.html).
   Data gemmes i localStorage og synkroniseres på tværs af faner
   via 'storage'-events, så nye bestillinger dukker op i admin
   med det samme.
   ============================================================ */

const SpiisStore = (() => {
  const KEY = 'spiis-data-v1';
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
      },
      /* index 0 = mandag */
      hours: [
        { open: '11:00', close: '19:30', closed: false },
        { open: '11:00', close: '19:30', closed: false },
        { open: '11:00', close: '19:30', closed: false },
        { open: '11:00', close: '19:30', closed: false },
        { open: '11:00', close: '20:00', closed: false },
        { open: '12:00', close: '19:00', closed: false },
        { open: '', close: '', closed: true },
      ],
      dagensRet: {},   /* { 'YYYY-MM-DD': {title, desc, price} } */
      menu: {
        weekly: [[], [], [], [], [], [], []], /* ekstra retter pr. ugedag */
        categories: [
          {
            id: 'smorrebrod', name: 'Smørrebrød & sandwich',
            items: [
              { name: 'Klassisk smørrebrød (3 stk.)', desc: 'Vælg mellem dagens udvalg – altid hjemmelavet pålæg.', price: 65 },
              { name: 'Lun sandwich med kylling', desc: 'Sprødt brød, marineret kylling, karrydressing og salat.', price: 59 },
              { name: 'Frikadelle-sandwich', desc: 'Hjemmelavede frikadeller, rødkål og mayo.', price: 55 },
            ],
          },
          {
            id: 'salater', name: 'Salater',
            items: [
              { name: 'Kyllingesalat', desc: 'Grillet kylling, sprød salat, croutoner og dressing.', price: 69 },
              { name: 'Ugens vegetarsalat', desc: 'Sæsonens grønt, bælgfrugter og hjemmelavet dressing.', price: 65 },
            ],
          },
          {
            id: 'sodt', name: 'Sødt & kager',
            items: [
              { name: 'Hjemmebagt kage', desc: 'Spørg efter dagens kage – bagt fra bunden.', price: 30 },
              { name: 'Boller med smør', desc: 'Lune, hjemmebagte boller.', price: 15 },
            ],
          },
          {
            id: 'drikke', name: 'Drikkevarer',
            items: [
              { name: 'Kaffe / te', desc: 'Friskbrygget.', price: 20 },
              { name: 'Sodavand', desc: 'Forskellige varianter.', price: 20 },
              { name: 'Hjemmelavet lemonade', desc: 'Efter sæson.', price: 25 },
            ],
          },
        ],
      },
      orders: [],       /* bestillinger af dagens ret */
      bookings: [],     /* arrangementer & møder */
      blockedDates: [], /* datoer chefen har lukket for booking */
      log: [],
    };

    /* Planlæg dagens ret 14 dage frem på åbne dage */
    let iso = todayISO();
    let dishIdx = 0;
    for (let i = 0; i < 14; i++) {
      const w = weekdayIndex(iso);
      if (!data.hours[w].closed) {
        data.dagensRet[iso] = { ...DISH_ROTATION[dishIdx % DISH_ROTATION.length] };
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

  /* ---------- settings & åbningstider ---------- */
  const getSettings = () => ({ ...data.settings });
  function updateSettings(patch) {
    data.settings = { ...data.settings, ...patch };
    save();
  }
  const getHours = () => data.hours.map((h) => ({ ...h }));
  function setHours(hours) {
    data.hours = hours;
    save();
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
  }

  /* ---------- bestillinger (dagens ret) ---------- */
  function addOrder(order) {
    const entry = {
      id: uid(),
      createdAt: new Date().toISOString(),
      status: 'ny',
      read: false,
      ...order,
    };
    data.orders.push(entry);
    save();
    return entry;
  }
  function getOrders(dateIso = null) {
    let list = data.orders.slice();
    if (dateIso) list = list.filter((o) => o.date === dateIso);
    return list.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  }
  function updateOrder(id, patch) {
    const o = data.orders.find((x) => x.id === id);
    if (o) { Object.assign(o, patch); save(); }
  }
  function deleteOrder(id) {
    data.orders = data.orders.filter((x) => x.id !== id);
    save();
  }

  /* ---------- bookinger (arrangementer & møder) ---------- */
  function addBooking(booking) {
    const entry = {
      id: uid(),
      createdAt: new Date().toISOString(),
      status: 'ny',
      read: false,
      ...booking,
    };
    data.bookings.push(entry);
    save();
    return entry;
  }
  function getBookings() {
    return data.bookings.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }
  function updateBooking(id, patch) {
    const b = data.bookings.find((x) => x.id === id);
    if (b) { Object.assign(b, patch); save(); }
  }
  function deleteBooking(id) {
    data.bookings = data.bookings.filter((x) => x.id !== id);
    save();
  }

  /* ---------- tilgængelighed for booking ---------- */
  const getBlockedDates = () => data.blockedDates.slice();
  function blockDate(iso) {
    if (!data.blockedDates.includes(iso)) {
      data.blockedDates.push(iso);
      data.blockedDates.sort();
      save();
    }
  }
  function unblockDate(iso) {
    data.blockedDates = data.blockedDates.filter((d) => d !== iso);
    save();
  }
  function isDateAvailable(iso) {
    if (!iso || iso < todayISO()) return { ok: false, reason: 'Datoen er passeret.' };
    if (!isOpenDay(iso)) return { ok: false, reason: 'Vi holder lukket denne dag.' };
    if (data.blockedDates.includes(iso)) return { ok: false, reason: 'Dagen er desværre optaget – vælg en anden dag.' };
    return { ok: true, reason: 'Dagen er ledig!' };
  }

  /* ---------- tidsintervaller ud fra åbningstider ---------- */
  function timeslotsFor(iso, stepMinutes = 30) {
    const h = hoursFor(iso);
    if (h.closed || !h.open || !h.close) return [];
    const [oh, om] = h.open.split(':').map(Number);
    const [ch, cm] = h.close.split(':').map(Number);
    const slots = [];
    let t = oh * 60 + om;
    const end = ch * 60 + cm;
    while (t <= end) {
      slots.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
      t += stepMinutes;
    }
    return slots;
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
    getMenu, setMenu,
    addOrder, getOrders, updateOrder, deleteOrder,
    addBooking, getBookings, updateBooking, deleteBooking,
    getBlockedDates, blockDate, unblockDate, isDateAvailable,
    timeslotsFor,
    getUnread, markAllRead,
    exportData, resetData,
    subscribe,
  };
})();
