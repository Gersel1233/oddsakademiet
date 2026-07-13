/* ============================================================
   Spiis – hovedside: rendering + interaktioner
   ============================================================ */

(() => {
  const S = SpiisStore;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const kr = (n) => `${n} kr.`;
  const esc = (str) => String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  /* ---------- klokke-hjælpere ---------- */
  const toMin = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const nowMin = () => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  };

  /* køkkenets tilstand lige nu: 'foer' (før åbning), 'aaben' eller 'lukket' */
  function kitchenStateToday() {
    const h = S.hoursFor(S.todayISO());
    if (h.closed) return 'lukket';
    const kitchen = S.getSettings().kitchenClose || h.close;
    const now = nowMin();
    if (now > toMin(kitchen)) return 'lukket';
    if (now >= toMin(h.open)) return 'aaben';
    return 'foer';
  }

  /* afhentningstider for en dag – i dag vises kun fremtidige tider
     (min. 20 min. varsel), så dagen "udløber" af sig selv */
  function slotsFor(iso) {
    let slots = S.timeslotsFor(iso, 30, true);
    if (iso === S.todayISO()) {
      const cutoff = nowMin() + 20;
      slots = slots.filter((t) => toMin(t) >= cutoff);
    }
    return slots;
  }

  /* er dagen reelt slut for madbestillinger? */
  const dayDone = (iso) => iso === S.todayISO() && slotsFor(iso).length === 0;

  /* ---------- navigation ---------- */
  const nav = $('#nav');
  const navLinks = $('#navLinks');
  const burger = $('#navBurger');

  function onScroll() {
    nav.classList.toggle('is-solid', window.scrollY > 40);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  burger.addEventListener('click', () => {
    const open = navLinks.classList.toggle('is-open');
    burger.classList.toggle('is-open', open);
    nav.classList.add('is-solid');
    burger.setAttribute('aria-expanded', String(open));
    if (!open) onScroll();
  });
  navLinks.addEventListener('click', (e) => {
    if (e.target.closest('a')) {
      navLinks.classList.remove('is-open');
      burger.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
      onScroll();
    }
  });

  /* ---------- hero ---------- */
  const hero = $('.hero');
  requestAnimationFrame(() => hero.classList.add('is-ready'));

  /* video: indlæses straks på desktop, men dovent på mobil, så tekst og
     dagens ret lander øjeblikkeligt på mobildata – videoen toner ind bagefter */
  const heroVideo = $('#heroVideo');
  function loadHeroVideo() {
    if (heroVideo.src) return;
    heroVideo.addEventListener('playing', () => heroVideo.classList.add('is-playing'), { once: true });
    heroVideo.src = heroVideo.dataset.src;
    heroVideo.play?.().catch(() => { /* autoplay kan blokeres – baggrunden dækker */ });
  }
  if (window.matchMedia('(min-width: 761px)').matches) {
    loadHeroVideo();
  } else if (document.readyState === 'complete') {
    setTimeout(loadHeroVideo, 250);
  } else {
    window.addEventListener('load', () => setTimeout(loadHeroVideo, 250), { once: true });
  }

  /* pausér video og marquee, når de er ude af syne – sparer CPU/batteri
     og gør scroll mere flydende */
  const heroIo = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      hero.classList.toggle('is-offscreen', !en.isIntersecting);
      if (!heroVideo.src) return;
      if (en.isIntersecting) heroVideo.play?.().catch(() => {});
      else heroVideo.pause?.();
    });
  }, { threshold: 0.05 });
  heroIo.observe(hero);

  const marquee = $('.marquee');
  const marqueeIo = new IntersectionObserver((entries) => {
    entries.forEach((en) => marquee.classList.toggle('is-paused', !en.isIntersecting));
  });
  marqueeIo.observe(marquee);

  /* fast bestil-knap på mobil – gemmer sig, mens man står ved formularen */
  const mobileCta = $('#mobileCta');
  const ctaIo = new IntersectionObserver((entries) => {
    entries.forEach((en) => mobileCta.classList.toggle('is-hidden', en.isIntersecting));
  }, { threshold: 0.1 });
  ctaIo.observe($('#bestil'));

  /* ---------- scroll-reveal ---------- */
  const revealEls = $$('[data-reveal]');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  revealEls.forEach((el, i) => {
    /* let forskydning når flere elementer står i samme sektion */
    el.style.setProperty('--reveal-delay', `${(i % 3) * 0.08}s`);
    io.observe(el);
  });

  /* ---------- dagens ret ---------- */
  function renderToday() {
    const today = S.todayISO();
    let iso = today;
    /* efter køkkenets lukketid er dagen slut – og dage med privat
       arrangement springes over, for dér kan man ikke bestille */
    let dish = (dayDone(today) || S.isOrderingClosed(today)) ? null : S.getDagensRet(iso);

    /* hvis der ikke er en ret (eller dagen er slut), så vis den næste planlagte */
    if (!dish) {
      for (let i = 1; i <= 14 && !dish; i++) {
        iso = S.addDays(today, i);
        if (S.isOrderingClosed(iso)) continue;
        dish = S.getDagensRet(iso);
      }
    }

    const label = $('#todayLabel');
    const title = $('#todayDish');
    const desc = $('#todayDesc');
    const price = $('#todayPrice');
    const stockEl = $('#todayStock');

    if (!dish) {
      label.textContent = 'Dagens ret';
      title.textContent = 'Vi opdaterer menuen lige nu';
      desc.textContent = 'Kig forbi snart – eller ring til os og hør, hvad der er på menuen.';
      price.textContent = '';
      stockEl.textContent = '';
      return;
    }
    label.textContent = iso === today ? 'I dag' : S.formatDate(iso);
    title.textContent = dish.title;
    desc.textContent = dish.desc || '';
    price.textContent = dish.price ? kr(dish.price) : '';

    const remaining = S.getRemaining(iso);
    stockEl.className = 'today__stock';
    if (remaining === null) {
      stockEl.textContent = '';
    } else if (remaining <= 0) {
      stockEl.textContent = 'Udsolgt i dag – vi ses i morgen!';
      stockEl.classList.add('is-soldout');
    } else if (remaining <= 5) {
      stockEl.textContent = `🔥 Kun ${remaining} portion${remaining === 1 ? '' : 'er'} tilbage!`;
      stockEl.classList.add('is-low');
    } else {
      stockEl.textContent = `${remaining} portioner tilbage`;
    }
    /* pulserende "live"-prik mens køkkenet er åbent i dag */
    if (iso === today && remaining !== null && remaining > 0 && kitchenStateToday() === 'aaben') {
      stockEl.classList.add('is-live');
    }
  }

  function renderWeekPlan() {
    const grid = $('#weekPlan');
    const plan = S.getPlan(7);
    grid.innerHTML = plan.map((day) => {
      const isToday = day.iso === S.todayISO();
      if (!day.open) {
        return `<div class="dayplan dayplan--closed">
          <div class="dayplan__day">${day.weekday}${isToday ? ' · i dag' : ''}</div>
          <div class="dayplan__date">${esc(S.formatDate(day.iso, false))}</div>
          <div class="dayplan__dish">Lukket</div>
        </div>`;
      }
      if (S.isOrderingClosed(day.iso)) {
        return `<div class="dayplan dayplan--closed">
          <div class="dayplan__day">${day.weekday}${isToday ? ' · i dag' : ''}</div>
          <div class="dayplan__date">${esc(S.formatDate(day.iso, false))}</div>
          <div class="dayplan__dish">🎉 Privat arrangement</div>
          <div class="dayplan__desc">Lukket for bestillinger denne dag.</div>
        </div>`;
      }
      const remaining = S.getRemaining(day.iso);
      let stockTag = '';
      if (remaining !== null && remaining <= 0) stockTag = '<span class="dayplan__tag dayplan__tag--soldout">Udsolgt</span>';
      else if (remaining !== null && remaining <= 5) stockTag = `<span class="dayplan__tag">Kun ${remaining} tilbage</span>`;
      return `<div class="dayplan">
        <div class="dayplan__day">${day.weekday}${isToday ? ' · i dag' : ''}</div>
        <div class="dayplan__date">${esc(S.formatDate(day.iso, false))}</div>
        <div class="dayplan__dish">${day.dish ? esc(day.dish.title) : 'Følger snart…'}</div>
        ${day.dish && day.dish.desc ? `<div class="dayplan__desc">${esc(day.dish.desc)}</div>` : ''}
        ${day.dish && day.dish.price ? `<div class="dayplan__price">${kr(day.dish.price)}</div>` : ''}
        ${stockTag}
      </div>`;
    }).join('');
  }

  /* ---------- menukort ---------- */
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
    const dish = S.getDagensRet(iso);
    const extras = S.getMenu().weekly[activeDay] || [];

    let rows = '';
    if (hours.closed) {
      rows = `<p class="daymenu__empty">Vi holder lukket om ${S.WEEKDAYS[activeDay].toLowerCase()}en – vi ses en anden dag! 👋</p>`;
    } else {
      const lines = [];
      if (dish) {
        lines.push(`<div class="menuline">
          <div>
            <div class="menuline__name">${esc(dish.title)}<span class="menuline__badge">Dagens ret</span></div>
            ${dish.desc ? `<div class="menuline__desc">${esc(dish.desc)}</div>` : ''}
          </div>
          <span class="menuline__price">${dish.price ? kr(dish.price) : ''}</span>
        </div>`);
      }
      extras.forEach((item) => {
        lines.push(`<div class="menuline">
          <div>
            <div class="menuline__name">${esc(item.name)}</div>
            ${item.desc ? `<div class="menuline__desc">${esc(item.desc)}</div>` : ''}
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
      <div class="card menucat ${wide ? 'menucat--wide' : ''}" data-reveal style="--reveal-delay:${(i % 4) * 0.08}s">
        <h4><span class="menucat__icon" aria-hidden="true">${catIcon(cat)}</span>${esc(cat.name)}${cat.availability === 'hverdage' ? '<span class="menucat__badge">Kun hverdage</span>' : ''}</h4>
        <div class="menucat__items">
        ${cat.items.map((item) => `
          <div class="menuline ${item.soldout ? 'menuline--soldout' : ''}">
            <div>
              <div class="menuline__name">${esc(item.name)}${item.soldout ? '<span class="menuline__badge menuline__badge--out">Udsolgt i dag</span>' : (item.left ? `<span class="menuline__badge menuline__badge--few">Kun ${esc(item.left)} tilbage</span>` : '')}</div>
              ${item.desc ? `<div class="menuline__desc">${esc(item.desc)}</div>` : ''}
            </div>
            <span class="menuline__price">${item.price ? kr(item.price) : ''}</span>
          </div>`).join('')}
        </div>
      </div>`;
    }).join('');
    $$('[data-reveal]', wrap).forEach((el) => io.observe(el));

    /* note om weekend-udvalget, hvis nogle kategorier kun er hverdage */
    const note = $('#menucatsNote');
    if (note) {
      const weekendCats = cats.filter((c) => c.availability !== 'hverdage').map((c) => c.name);
      note.textContent = cats.some((c) => c.availability === 'hverdage') && weekendCats.length
        ? `I weekenden serverer vi: ${weekendCats.join(', ')}.`
        : '';
    }
  }

  /* ---------- åbningstider ---------- */
  function renderHours() {
    const table = $('#hoursTable');
    const hours = S.getHours();
    const todayIdx = S.weekdayIndex(S.todayISO());
    table.innerHTML = hours.map((h, i) => `
      <tr class="${i === todayIdx ? 'is-today' : ''} ${h.closed ? 'is-closed' : ''}">
        <td>${S.WEEKDAYS[i]}</td>
        <td>${h.closed ? 'Lukket' : `${h.open} – ${h.close}`}</td>
      </tr>`).join('');

    const kitchenNote = $('#kitchenNote');
    if (kitchenNote) {
      const kitchen = S.getSettings().kitchenClose;
      kitchenNote.textContent = kitchen ? `🍳 Køkkenet lukker alle dage kl. ${kitchen}` : '';
    }

    const status = $('#openStatus');
    const h = hours[todayIdx];
    const now = nowMin();
    const kitchen = S.getSettings().kitchenClose;
    if (h.closed) {
      status.textContent = '● Vi holder lukket i dag';
      status.className = 'hours__status is-closed';
    } else if (now < toMin(h.open)) {
      status.textContent = `● Vi har lukket lige nu – vi åbner kl. ${h.open}`;
      status.className = 'hours__status is-closed';
    } else if (now <= toMin(h.close)) {
      if (toMin(h.close) - now <= 60) {
        status.textContent = `● Vi lukker snart – åbent til kl. ${h.close}`;
        status.className = 'hours__status is-soon';
      } else if (kitchen && now > toMin(kitchen)) {
        status.textContent = `● Køkkenet er lukket for i dag – vi har åbent til kl. ${h.close}`;
        status.className = 'hours__status is-soon';
      } else {
        status.textContent = `● Vi har åbent nu – frem til kl. ${h.close}`;
        status.className = 'hours__status is-open';
      }
    } else {
      status.textContent = '● Vi har lukket for i dag';
      status.className = 'hours__status is-closed';
    }
  }

  /* ---------- bestil: kurv med dagens ret + hele menukortet ---------- */
  const orderDate = $('#orderDate');
  const orderTime = $('#orderTime');
  const orderDishHint = $('#orderDishHint');
  const builderEl = $('#builder');
  const basketBar = $('#basketBar');

  /* kurven: key -> { name, qty, price, kind } */
  let basket = {};
  let builderIndex = {};
  const openCats = new Set();

  const basketLines = () => Object.values(basket).filter((l) => l.qty > 0);

  function renderOrderDates() {
    const plan = S.getPlan(14);
    const options = plan
      .filter((d) => d.open && slotsFor(d.iso).length > 0 && !S.isOrderingClosed(d.iso))
      .map((d) => {
        const remaining = S.getRemaining(d.iso);
        const soldOut = d.dish && remaining !== null && remaining <= 0;
        const what = d.dish ? `${d.dish.title}${soldOut ? ' (udsolgt)' : ''}` : 'menukort';
        const label = `${d.iso === S.todayISO() ? 'I dag – ' : ''}${S.formatDate(d.iso)} · ${what}`;
        return `<option value="${d.iso}">${esc(label)}</option>`;
      });
    orderDate.innerHTML = options.length
      ? options.join('')
      : '<option value="">Ingen dage åbne for bestilling lige nu</option>';
    onOrderDateChange();
  }

  function onOrderDateChange() {
    const iso = orderDate.value;
    if (!iso) {
      orderTime.innerHTML = '<option value="">–</option>';
      orderDishHint.textContent = '';
      builderEl.innerHTML = '';
      basket = {};
      renderBasketBar();
      return;
    }
    const dish = S.getDagensRet(iso);
    const remaining = S.getRemaining(iso);
    let hint = dish
      ? `Dagens ret: ${dish.title}${dish.price ? ` · ${kr(dish.price)}` : ''}`
      : 'Ingen dagens ret denne dag – vælg frit fra menukortet.';
    if (dish && remaining !== null) hint += remaining > 0 ? ` · ${remaining} tilbage` : ' · udsolgt';
    orderDishHint.textContent = hint;
    orderDishHint.className = `field__hint ${dish && remaining !== null && remaining <= 5 ? (remaining <= 0 ? 'is-bad' : 'is-ok') : ''}`;
    if (iso === S.todayISO() && dish && remaining !== null && remaining > 0 && kitchenStateToday() === 'aaben') {
      orderDishHint.classList.add('is-live');
    }

    renderBuilder();

    /* kun fremtidige afhentningstider – og aldrig efter køkkenets lukketid */
    const slots = slotsFor(iso);
    orderTime.innerHTML = slots.map((t) => `<option value="${t}">kl. ${t}</option>`).join('');
    /* fornuftigt standardvalg: 17:30 hvis muligt */
    if (slots.includes('17:30')) orderTime.value = '17:30';
  }
  orderDate.addEventListener('change', onOrderDateChange);

  /* kurv-opbyggeren: dagens ret øverst, menukortets kategorier under */
  function renderBuilder() {
    const iso = orderDate.value;
    const dish = iso ? S.getDagensRet(iso) : null;
    const remaining = iso ? S.getRemaining(iso) : null;
    const menu = S.getMenu();
    const wIdx = iso ? S.weekdayIndex(iso) : 0;
    const weekend = wIdx >= 5;

    /* indeks over alt, der kan bestilles på den valgte dag */
    builderIndex = {};
    if (dish) builderIndex.dagens = { name: dish.title, price: dish.price ?? null, kind: 'dagensret', cat: 'Dagens ret' };
    const groups = [];
    const extras = (menu.weekly[wIdx] || []).filter((i) => i.name);
    if (extras.length) groups.push({ name: 'Dagens ekstra retter', items: extras });
    menu.categories
      .filter((cat) => cat.availability !== 'hverdage' || !weekend)
      .forEach((cat) => groups.push({ name: cat.name, items: cat.items.filter((i) => i.name) }));
    groups.forEach((g) => g.items.forEach((item) => {
      builderIndex['m::' + item.name] = {
        name: item.name, price: item.price ?? null, kind: 'menu', cat: g.name,
        soldout: !!item.soldout, left: item.left ?? null,
      };
    }));

    /* ryd kurven for varer, der ikke findes på den valgte dag – eller er udsolgt.
       Er der kun få tilbage, sættes antallet i kurven automatisk ned. */
    Object.keys(basket).forEach((key) => {
      const inf = builderIndex[key];
      if (!inf || inf.soldout) { delete basket[key]; return; }
      if (key !== 'dagens' && inf.left != null && basket[key].qty > Number(inf.left)) {
        basket[key].qty = Number(inf.left);
        if (!basket[key].qty) delete basket[key];
      }
    });
    if (basket.dagens && remaining !== null && basket.dagens.qty > remaining) {
      basket.dagens.qty = remaining;
      if (!basket.dagens.qty) delete basket.dagens;
    }

    const stepper = (key, max) => {
      const qty = basket[key] ? basket[key].qty : 0;
      const plusOff = max !== null && qty >= max;
      return `<div class="stepper">
        <button type="button" data-step="-1" data-key="${esc(key)}" aria-label="Én mindre" ${qty <= 0 ? 'disabled' : ''}>−</button>
        <b>${qty}</b>
        <button type="button" data-step="1" data-key="${esc(key)}" aria-label="Én mere" ${plusOff ? 'disabled' : ''}>+</button>
      </div>`;
    };

    let html = '';
    if (dish) {
      const soldOut = remaining !== null && remaining <= 0;
      html += `<div class="builder__dagens">
        <div class="bitem__info">
          <strong>${esc(dish.title)}<span class="menuline__badge">Dagens ret</span></strong>
          ${dish.desc ? `<small>${esc(dish.desc)}</small>` : ''}
          ${dish.price ? `<em>${kr(dish.price)}</em>` : ''}
        </div>
        ${soldOut ? '<span class="builder__soldout">Udsolgt</span>' : stepper('dagens', remaining)}
      </div>`;
    }
    html += groups.map((g) => {
      const count = g.items.reduce((s, item) => s + ((basket['m::' + item.name] || {}).qty || 0), 0);
      const open = openCats.has(g.name) || count > 0;
      return `<details class="bcat" data-cat="${esc(g.name)}" ${open ? 'open' : ''}>
        <summary><span>${esc(g.name)}</span>${count ? `<span class="bcat__count">${count} valgt</span>` : '<span class="bcat__hint">+ tilføj</span>'}</summary>
        ${g.items.map((item) => `
          <div class="bitem ${item.soldout ? 'bitem--soldout' : ''}">
            <div class="bitem__info">
              <strong>${esc(item.name)}${item.soldout ? '<span class="menuline__badge menuline__badge--out">Udsolgt i dag</span>' : (item.left ? `<span class="menuline__badge menuline__badge--few">Kun ${esc(item.left)} tilbage</span>` : '')}</strong>
              ${item.desc ? `<small>${esc(item.desc)}</small>` : ''}
              ${item.price ? `<em>${kr(item.price)}</em>` : ''}
            </div>
            ${item.soldout ? '<span class="builder__soldout">Udsolgt</span>' : stepper('m::' + item.name, item.left != null ? Number(item.left) : 50)}
          </div>`).join('')}
      </details>`;
    }).join('');

    builderEl.innerHTML = html || '<p class="builder__empty">Menuen for denne dag er på vej – ring til os, så hjælper vi.</p>';
    builderEl.querySelectorAll('details').forEach((d) => {
      d.addEventListener('toggle', () => {
        if (d.open) openCats.add(d.dataset.cat);
        else openCats.delete(d.dataset.cat);
      });
    });
    renderBasketBar();
  }

  builderEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-step]');
    if (!btn || btn.disabled) return;
    const key = btn.dataset.key;
    const info = builderIndex[key];
    if (!info || info.soldout) return;
    const cur = basket[key] ? basket[key].qty : 0;
    let next = cur + Number(btn.dataset.step);
    const max = key === 'dagens'
      ? S.getRemaining(orderDate.value)
      : (info.left != null ? Number(info.left) : 50);
    if (max !== null && next > max) next = max;
    if (next <= 0) delete basket[key];
    else basket[key] = { name: info.name, qty: next, price: info.price, kind: info.kind, cat: info.cat };
    renderBuilder();
  });

  function renderBasketBar() {
    const lines = basketLines();
    if (!lines.length) { basketBar.hidden = true; return; }
    basketBar.hidden = false;
    const totalItems = lines.reduce((s, l) => s + l.qty, 0);
    const total = lines.reduce((s, l) => s + (l.price ? l.price * l.qty : 0), 0);
    basketBar.innerHTML = `<strong>Jeres bestilling:</strong> ${lines.map((l) => `${l.qty} × ${esc(l.name)}`).join(' · ')}
      <span class="basketbar__total">${totalItems} ret${totalItems === 1 ? '' : 'ter'}${total ? ` · i alt ${total} kr.` : ''}</span>`;
  }

  /* Trin 1: tjek felterne og vis "bekræft bestilling" med kvittering */
  let pendingOrder = null;
  const confirmWrap = $('#orderConfirmWrap');

  $('#orderForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const error = $('#orderError');
    error.hidden = true;

    const iso = orderDate.value;
    const time = orderTime.value;
    const persons = Number($('#orderPersons').value);
    const type = $('input[name="orderType"]:checked').value;
    const name = $('#orderName').value.trim();
    const phone = $('#orderPhone').value.trim();
    const note = $('#orderNote').value.trim();
    const lines = basketLines();

    const problems = [];
    if (!iso) problems.push('vælg en dato');
    if (!time) problems.push('vælg et tidspunkt');
    if (!lines.length) problems.push('læg mindst én ret i bestillingen');
    if (!persons || persons < 1) problems.push('angiv antal personer');
    if (!name) problems.push('skriv dit navn');
    if (!/^[\d+\s-]{6,}$/.test(phone)) problems.push('skriv et gyldigt telefonnummer');

    if (problems.length) {
      error.textContent = `Hov! I mangler at: ${problems.join(', ')}.`;
      error.hidden = false;
      return;
    }

    pendingOrder = { iso, time, persons, type, name, phone, note, lines };
    openConfirm();
  });

  function openConfirm() {
    const o = pendingOrder;
    const total = o.lines.reduce((s, l) => s + (l.price ? l.price * l.qty : 0), 0);
    $('#confirmLines').innerHTML = o.lines.map((l) => `
      <div class="confirm__line"><span><b>${l.qty} ×</b> ${esc(l.name)}</span><span>${l.price ? kr(l.price * l.qty) : ''}</span></div>`).join('')
      + (total ? `<div class="confirm__line confirm__line--total"><span>I alt</span><span>${kr(total)}</span></div>` : '');
    $('#confirmMeta').innerHTML = `
      <div>📅 ${esc(S.formatDate(o.iso))} · kl. ${esc(o.time)}</div>
      <div>${o.type === 'togo' ? '🥡 Takeaway' : '🍽️ Spiser her'} · 👥 ${o.persons} person${o.persons === 1 ? '' : 'er'}</div>
      <div>🙋 ${esc(o.name)} · 📞 ${esc(o.phone)}</div>
      ${o.note ? `<div>💬 ${esc(o.note)}</div>` : ''}`;
    confirmWrap.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeConfirm() {
    confirmWrap.hidden = true;
    document.body.style.overflow = '';
  }
  $('#confirmBack').addEventListener('click', closeConfirm);
  confirmWrap.addEventListener('click', (e) => { if (e.target === confirmWrap) closeConfirm(); });

  /* Trin 2: kunden har set kvitteringen og bekræfter – NU sendes den */
  $('#confirmSend').addEventListener('click', async () => {
    if (!pendingOrder) return;
    const o = pendingOrder;
    const btn = $('#confirmSend');
    const error = $('#orderError');
    error.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Sender…';

    const dish = S.getDagensRet(o.iso);
    const dagensQty = basket.dagens ? basket.dagens.qty : 0;
    const result = await S.addOrder({
      date: o.iso,
      time: o.time,
      qty: dagensQty,
      type: o.type,
      name: o.name,
      phone: o.phone,
      note: o.note,
      dish: dagensQty > 0 && dish ? dish.title : '',
      price: dagensQty > 0 && dish ? dish.price : null,
      items: o.lines,
      persons: o.persons,
    });
    btn.disabled = false;
    btn.textContent = '✓ Bekræft & send';
    closeConfirm();

    if (!result.ok) {
      if (result.error === 'net') {
        error.textContent = 'Bestillingen kunne ikke sendes lige nu – prøv igen, eller ring til os.';
      } else if (result.reason === 'lukket') {
        error.textContent = 'Denne dag er netop blevet lukket for bestillinger (privat arrangement) – vælg venligst en anden dag.';
        if (S.isCloud()) S.refreshPublic();
      } else if (result.reason === 'udsolgt') {
        error.textContent = `„${result.item}" er desværre lige blevet udsolgt i dag – den er fjernet fra jeres bestilling, så prøv bare igen.`;
        Object.keys(basket).forEach((k) => { if (basket[k].name === result.item) delete basket[k]; });
        if (S.isCloud()) S.refreshPublic();
      } else if (result.reason === 'antal') {
        error.textContent = `Der er kun ${result.remaining} × „${result.item}" tilbage i dag – antallet i jeres bestilling er sat ned, så tjek og send igen.`;
        const k = 'm::' + result.item;
        if (basket[k]) {
          basket[k].qty = Math.max(0, Number(result.remaining));
          if (!basket[k].qty) delete basket[k];
        }
        if (S.isCloud()) S.refreshPublic();
      } else {
        error.textContent = result.remaining > 0
          ? `Åh nej – der er kun ${result.remaining} portion${result.remaining === 1 ? '' : 'er'} dagens ret tilbage denne dag. Sæt antallet ned eller vælg en anden dag.`
          : 'Dagens ret er desværre lige blevet udsolgt – fjern den fra bestillingen eller vælg en anden dag.';
      }
      error.hidden = false;
      onOrderDateChange();
      error.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    $('#orderForm').hidden = true;
    const success = $('#orderSuccess');
    success.hidden = false;
    $('#orderSuccessText').textContent =
      `${o.lines.map((l) => `${l.qty} × ${l.name}`).join(', ')} — til ${o.persons} person${o.persons === 1 ? '' : 'er'} ${o.type === 'togo' ? 'til afhentning' : 'ved bordet'} ${S.formatDate(o.iso).toLowerCase()} kl. ${o.time}. Vi glæder os til at se jer, ${o.name}!`;
    success.scrollIntoView({ behavior: 'smooth', block: 'center' });
    pendingOrder = null;
  });

  $('#orderAgainBtn').addEventListener('click', () => {
    $('#orderSuccess').hidden = true;
    const form = $('#orderForm');
    form.hidden = false;
    form.reset();
    basket = {};
    renderOrderDates();
  });

  /* ---------- booking ---------- */
  const bookingKind = $('#bookingKind');
  const bookingDate = $('#bookingDate');
  const bookingTime = $('#bookingTime');
  const bookingAvail = $('#bookingAvail');

  /* arrangement = uforpligtende forespørgsel · møde = rigtig booking */
  function syncBookingMode() {
    const isMoede = bookingKind.value === 'moede';
    $('#bookingSubjectLabel').textContent = isMoede
      ? 'Hvad vil du gerne tale med os om?'
      : 'Hvad drejer arrangementet sig om?';
    $('#bookingSubject').placeholder = isMoede
      ? 'Fx menu til konfirmation i maj'
      : 'Fx konfirmation for 30 personer';
    $('#bookingDateLabel').innerHTML = isMoede ? 'Ønsket dato' : 'Ønsket dato <em>(valgfrit)</em>';
    $('#bookingTimeField').hidden = !isMoede;
    $('#bookingEmailLabel').innerHTML = isMoede
      ? 'E-mail <em>(valgfrit)</em>'
      : 'E-mail <em>(vi svarer på mail eller telefon)</em>';
    $('#bookingSubmit').textContent = isMoede ? 'Book mødet' : 'Send forespørgsel';
    $('#bookingNote').textContent = isMoede
      ? 'Vi bekræfter din booking hurtigst muligt på telefon.'
      : 'Vi vender tilbage til jer hurtigst muligt på telefon eller mail.';
  }

  $$('.choice').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.choice').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      bookingKind.value = btn.dataset.kind;
      syncBookingMode();
      /* en dag kan være ledig til møde men optaget til arrangement */
      onBookingDateChange();
    });
  });
  syncBookingMode();

  bookingDate.min = S.todayISO();

  /* Spiis-kalender: lukkede og optagede dage kan slet ikke vælges.
     Dage med et aftalt arrangement er kun optaget for NYE arrangementer. */
  SpiisDatepicker.attach(bookingDate, {
    min: S.todayISO(),
    legend: true,
    state: (iso) => {
      if (!S.isOpenDay(iso)) return 'closed';
      if (S.getBlockedDates().includes(iso)) return 'blocked';
      if (bookingKind.value !== 'moede' && S.getArrangementDates().includes(iso)) return 'blocked';
      return 'ok';
    },
  });

  function onBookingDateChange() {
    const iso = bookingDate.value;
    if (!iso) { bookingAvail.textContent = ''; bookingAvail.className = 'field__hint'; return; }
    const avail = S.isDateAvailable(iso, bookingKind.value);
    bookingAvail.textContent = (avail.ok ? '✓ ' : '✕ ') + avail.reason;
    bookingAvail.className = `field__hint ${avail.ok ? 'is-ok' : 'is-bad'}`;

    const slots = avail.ok ? S.timeslotsFor(iso, 30) : [];
    bookingTime.innerHTML = slots.length
      ? slots.map((t) => `<option value="${t}">kl. ${t}</option>`).join('')
      : '<option value="">–</option>';
  }
  bookingDate.addEventListener('change', onBookingDateChange);
  bookingDate.addEventListener('input', onBookingDateChange);
  onBookingDateChange();

  $('#bookingForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = $('#bookingError');
    error.hidden = true;

    const kind = bookingKind.value;
    const isMoede = kind === 'moede';
    const subject = $('#bookingSubject').value.trim();
    const desc = $('#bookingDesc').value.trim();
    const iso = bookingDate.value;
    const time = isMoede ? bookingTime.value : '';
    const name = $('#bookingName').value.trim();
    const phone = $('#bookingPhone').value.trim();
    const email = $('#bookingEmail').value.trim();

    const problems = [];
    if (!subject) problems.push('skriv hvad det drejer sig om');
    if (isMoede && !iso) problems.push('vælg en dato');
    if (!name) problems.push('skriv dit navn');
    if (!/^[\d+\s-]{6,}$/.test(phone)) problems.push('skriv et gyldigt telefonnummer');

    if (problems.length) {
      error.textContent = `Hov! Du mangler at: ${problems.join(', ')}.`;
      error.hidden = false;
      return;
    }

    /* er der valgt en dato, skal den være ledig – uanset type */
    if (iso) {
      const avail = S.isDateAvailable(iso, kind);
      if (!avail.ok) {
        error.textContent = `Datoen kan ikke vælges: ${avail.reason}`;
        error.hidden = false;
        return;
      }
    }
    if (isMoede && !time) {
      error.textContent = 'Vælg et tidspunkt for dit møde.';
      error.hidden = false;
      return;
    }

    const submitBtn = $('#bookingSubmit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sender…';
    const result = await S.addBooking({ kind, subject, desc, date: iso || null, time, name, phone, email });
    submitBtn.disabled = false;
    submitBtn.textContent = isMoede ? 'Book mødet' : 'Send forespørgsel';

    if (!result.ok) {
      error.textContent = `${isMoede ? 'Bookingen' : 'Forespørgslen'} kunne ikke sendes lige nu – prøv igen, eller ring til os.`;
      error.hidden = false;
      return;
    }

    $('#bookingForm').hidden = true;
    document.querySelector('.booking__aside').hidden = true;
    document.querySelector('.booking__choice').hidden = true;
    const success = $('#bookingSuccess');
    success.hidden = false;
    $('#bookingSuccessTitle').textContent = isMoede ? 'Tak for din booking!' : 'Tak for jeres forespørgsel! 🎉';
    $('#bookingSuccessText').textContent = isMoede
      ? `Dit møde er booket ${S.formatDate(iso).toLowerCase()} kl. ${time}. Vi ringer til dig på ${phone} og bekræfter hurtigst muligt.`
      : `Vi har modtaget jeres forespørgsel${iso ? ` med ønsket dato ${S.formatDate(iso).toLowerCase()}` : ''} og vender tilbage til jer på telefon eller mail hurtigst muligt – vi glæder os til at høre mere om jeres arrangement!`;
    success.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  $('#bookAgainBtn').addEventListener('click', () => {
    $('#bookingSuccess').hidden = true;
    const form = $('#bookingForm');
    form.hidden = false;
    form.reset();
    document.querySelector('.booking__aside').hidden = false;
    document.querySelector('.booking__choice').hidden = false;
    $$('.choice').forEach((b) => b.classList.toggle('is-active', b.dataset.kind === bookingKind.value));
    syncBookingMode();
    onBookingDateChange();
  });

  /* ---------- kontakt fra indstillinger ---------- */
  function renderContact() {
    const s = S.getSettings();
    const tel = `tel:+45${s.phone.replace(/\s/g, '')}`;
    const phoneLink = $('#contactPhone');
    phoneLink.href = tel;
    phoneLink.lastElementChild.textContent = s.phone;
    const emailLink = $('#contactEmail');
    emailLink.href = `mailto:${s.email}`;
    emailLink.lastElementChild.textContent = s.email;
  }

  /* ---------- besked hvis den fælles database er nede ----------
     Uden den ville en bestilling kun lande i kundens egen browser
     og aldrig nå køkkenet – så hellere bede folk ringe. */
  function renderCloudNotice() {
    const down = S.isCloudConfigured() && S.isCloudDown();
    const phone = S.getSettings().phone;
    $('#orderOffline').hidden = !down;
    $('#bookingOffline').hidden = !down;
    if (down) {
      $('#orderOffline').textContent = `⚠️ Online-bestilling er nede i øjeblikket. Ring til os på ${phone}, så klarer vi det over telefonen.`;
      $('#bookingOffline').textContent = `⚠️ Online-booking er nede i øjeblikket. Ring til os på ${phone}, så finder vi en dag sammen.`;
    }
    $('#orderForm button[type="submit"]').disabled = down;
    $('#bookingSubmit').disabled = down;
  }

  /* ---------- footer ---------- */
  $('#year').textContent = new Date().getFullYear();

  /* ---------- render alt (og gen-render hvis admin ændrer data) ---------- */
  function renderAll() {
    renderToday();
    renderWeekPlan();
    renderDayTabs();
    renderDayMenu();
    renderCategories();
    renderHours();
    renderOrderDates();
    renderContact();
    renderCloudNotice();
  }
  renderAll();

  S.subscribe(() => {
    renderToday();
    renderWeekPlan();
    renderDayTabs();
    renderDayMenu();
    renderCategories();
    renderHours();
    renderContact();
    renderCloudNotice();
    refreshOrderDatesPreserving();
  });

  /* genopfrisk datolisten uden at smide brugerens valg væk,
     og aldrig midt i, at der tastes i formularen */
  function refreshOrderDatesPreserving() {
    const form = $('#orderForm');
    if (form.hidden || form.contains(document.activeElement)) return;
    const prev = orderDate.value;
    renderOrderDates();
    if ([...orderDate.options].some((o) => o.value === prev && !o.disabled)) {
      orderDate.value = prev;
      onOrderDateChange();
    }
  }

  /* klokke-styrede tilstande (live-lager, "lukker snart", dagens dato
     udløber ved køkkenluk) holdes friske */
  setInterval(() => {
    renderToday();
    renderWeekPlan();
    renderHours();
    refreshOrderDatesPreserving();
  }, 60000);
})();
