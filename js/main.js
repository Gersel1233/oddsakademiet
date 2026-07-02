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
    let dish = S.getDagensRet(iso);

    /* hvis der ikke er en ret i dag, så vis den næste planlagte */
    if (!dish) {
      for (let i = 1; i <= 14 && !dish; i++) {
        iso = S.addDays(today, i);
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
      const remaining = S.getRemaining(day.iso);
      let stockTag = '';
      if (remaining !== null && remaining <= 0) stockTag = '<span class="dayplan__tag dayplan__tag--soldout">Udsolgt</span>';
      else if (remaining !== null && remaining <= 5) stockTag = `<span class="dayplan__tag">Kun ${remaining} tilbage</span>`;
      return `<div class="dayplan">
        <div class="dayplan__day">${day.weekday}${isToday ? ' · i dag' : ''}</div>
        <div class="dayplan__date">${esc(S.formatDate(day.iso, false))}</div>
        <div class="dayplan__dish">${day.dish ? esc(day.dish.title) : 'Følger snart…'}</div>
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

  function renderCategories() {
    const wrap = $('#menuCategories');
    const cats = S.getMenu().categories;
    wrap.innerHTML = cats.map((cat, i) => `
      <div class="card menucat" data-reveal style="--reveal-delay:${(i % 4) * 0.08}s">
        <h4>${esc(cat.name)}${cat.availability === 'hverdage' ? '<span class="menucat__badge">Kun hverdage</span>' : ''}</h4>
        ${cat.items.map((item) => `
          <div class="menuline">
            <div>
              <div class="menuline__name">${esc(item.name)}</div>
              ${item.desc ? `<div class="menuline__desc">${esc(item.desc)}</div>` : ''}
            </div>
            <span class="menuline__price">${item.price ? kr(item.price) : ''}</span>
          </div>`).join('')}
      </div>`).join('');
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
    const now = new Date();
    const h = hours[todayIdx];
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (!h.closed && hhmm >= h.open && hhmm <= h.close) {
      status.textContent = `● Vi har åbent nu – frem til kl. ${h.close}`;
      status.className = 'hours__status is-open';
    } else {
      status.textContent = '● Vi har lukket lige nu';
      status.className = 'hours__status is-closed';
    }
  }

  /* ---------- bestil dagens ret ---------- */
  const orderDate = $('#orderDate');
  const orderTime = $('#orderTime');
  const orderDishHint = $('#orderDishHint');

  function renderOrderDates() {
    const plan = S.getPlan(14);
    const options = plan
      .filter((d) => d.open && d.dish)
      .map((d) => {
        const remaining = S.getRemaining(d.iso);
        const soldOut = remaining !== null && remaining <= 0;
        const label = `${d.iso === S.todayISO() ? 'I dag – ' : ''}${S.formatDate(d.iso)} · ${d.dish.title}${soldOut ? ' · UDSOLGT' : ''}`;
        return `<option value="${d.iso}" ${soldOut ? 'disabled' : ''}>${esc(label)}</option>`;
      });
    orderDate.innerHTML = options.length
      ? options.join('')
      : '<option value="">Ingen dage åbne for bestilling lige nu</option>';
    /* spring frem til første dag, der ikke er udsolgt */
    const firstOpen = [...orderDate.options].find((o) => !o.disabled && o.value);
    if (firstOpen) orderDate.value = firstOpen.value;
    onOrderDateChange();
  }

  function onOrderDateChange() {
    const iso = orderDate.value;
    if (!iso) {
      orderTime.innerHTML = '<option value="">–</option>';
      orderDishHint.textContent = '';
      return;
    }
    const dish = S.getDagensRet(iso);
    const remaining = S.getRemaining(iso);
    let hint = dish ? `Dagens ret: ${dish.title}${dish.price ? ` · ${kr(dish.price)}` : ''}` : '';
    if (remaining !== null) hint += remaining > 0 ? ` · ${remaining} tilbage` : ' · udsolgt';
    orderDishHint.textContent = hint;
    orderDishHint.className = `field__hint ${remaining !== null && remaining <= 5 ? (remaining <= 0 ? 'is-bad' : 'is-ok') : ''}`;

    /* begræns antal til det, der er tilbage */
    const qtyInput = $('#orderQty');
    qtyInput.max = remaining !== null ? Math.max(1, remaining) : 50;
    if (remaining !== null && Number(qtyInput.value) > remaining) {
      qtyInput.value = Math.max(1, remaining);
    }

    /* madbestillinger kan kun afhentes frem til køkkenets lukketid */
    const slots = S.timeslotsFor(iso, 30, true);
    orderTime.innerHTML = slots.map((t) => `<option value="${t}">kl. ${t}</option>`).join('');
    /* fornuftigt standardvalg: 17:30 hvis muligt */
    if (slots.includes('17:30')) orderTime.value = '17:30';
  }
  orderDate.addEventListener('change', onOrderDateChange);

  $('#orderForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = $('#orderError');
    error.hidden = true;

    const iso = orderDate.value;
    const time = orderTime.value;
    const qty = Number($('#orderQty').value);
    const type = $('input[name="orderType"]:checked').value;
    const name = $('#orderName').value.trim();
    const phone = $('#orderPhone').value.trim();
    const note = $('#orderNote').value.trim();

    const problems = [];
    if (!iso) problems.push('vælg en dato');
    if (!time) problems.push('vælg et tidspunkt');
    if (!qty || qty < 1) problems.push('angiv antal kuverter');
    if (!name) problems.push('skriv dit navn');
    if (!/^[\d+\s-]{6,}$/.test(phone)) problems.push('skriv et gyldigt telefonnummer');

    if (problems.length) {
      error.textContent = `Hov! Du mangler at: ${problems.join(', ')}.`;
      error.hidden = false;
      return;
    }

    const dish = S.getDagensRet(iso);
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sender…';
    const result = await S.addOrder({
      date: iso,
      time,
      qty,
      type,
      name,
      phone,
      note,
      dish: dish ? dish.title : 'Dagens ret',
      price: dish ? dish.price : null,
    });
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send bestilling';

    if (!result.ok) {
      if (result.error === 'net') {
        error.textContent = 'Bestillingen kunne ikke sendes lige nu – prøv igen, eller ring til os.';
      } else {
        error.textContent = result.remaining > 0
          ? `Åh nej – der er kun ${result.remaining} portion${result.remaining === 1 ? '' : 'er'} tilbage denne dag. Vælg færre kuverter eller en anden dag.`
          : 'Dagens ret er desværre udsolgt denne dag – vælg en anden dag i kalenderen.';
      }
      error.hidden = false;
      onOrderDateChange();
      return;
    }

    $('#orderForm').hidden = true;
    const success = $('#orderSuccess');
    success.hidden = false;
    $('#orderSuccessText').textContent =
      `${qty} × ${dish ? dish.title : 'dagens ret'} ${type === 'togo' ? 'til afhentning' : 'ved bordet'} ${S.formatDate(iso).toLowerCase()} kl. ${time}. Vi glæder os til at se dig, ${name}!`;
    success.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  $('#orderAgainBtn').addEventListener('click', () => {
    $('#orderSuccess').hidden = true;
    const form = $('#orderForm');
    form.hidden = false;
    form.reset();
    renderOrderDates();
  });

  /* ---------- booking ---------- */
  const bookingKind = $('#bookingKind');
  const bookingDate = $('#bookingDate');
  const bookingTime = $('#bookingTime');
  const bookingAvail = $('#bookingAvail');

  $$('.choice').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.choice').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const kind = btn.dataset.kind;
      bookingKind.value = kind;
      $('#bookingSubjectLabel').textContent = kind === 'moede'
        ? 'Hvad vil du gerne tale med os om?'
        : 'Hvad drejer arrangementet sig om?';
      $('#bookingSubject').placeholder = kind === 'moede'
        ? 'Fx menu til konfirmation i maj'
        : 'Fx konfirmation for 30 personer';
      $('#bookingSubmit').textContent = kind === 'moede' ? 'Book mødet' : 'Send booking';
    });
  });

  bookingDate.min = S.todayISO();

  function onBookingDateChange() {
    const iso = bookingDate.value;
    if (!iso) { bookingAvail.textContent = ''; bookingAvail.className = 'field__hint'; return; }
    const avail = S.isDateAvailable(iso);
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
    const subject = $('#bookingSubject').value.trim();
    const desc = $('#bookingDesc').value.trim();
    const iso = bookingDate.value;
    const time = bookingTime.value;
    const name = $('#bookingName').value.trim();
    const phone = $('#bookingPhone').value.trim();
    const email = $('#bookingEmail').value.trim();

    const problems = [];
    if (!subject) problems.push('skriv hvad det drejer sig om');
    if (!iso) problems.push('vælg en dato');
    if (!name) problems.push('skriv dit navn');
    if (!/^[\d+\s-]{6,}$/.test(phone)) problems.push('skriv et gyldigt telefonnummer');

    if (problems.length) {
      error.textContent = `Hov! Du mangler at: ${problems.join(', ')}.`;
      error.hidden = false;
      return;
    }

    const avail = S.isDateAvailable(iso);
    if (!avail.ok) {
      error.textContent = `Datoen kan ikke bookes: ${avail.reason}`;
      error.hidden = false;
      return;
    }
    if (!time) {
      error.textContent = 'Vælg et tidspunkt for din booking.';
      error.hidden = false;
      return;
    }

    const submitBtn = $('#bookingSubmit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sender…';
    const result = await S.addBooking({ kind, subject, desc, date: iso, time, name, phone, email });
    submitBtn.disabled = false;
    submitBtn.textContent = kind === 'moede' ? 'Book mødet' : 'Send booking';

    if (!result.ok) {
      error.textContent = 'Bookingen kunne ikke sendes lige nu – prøv igen, eller ring til os.';
      error.hidden = false;
      return;
    }

    $('#bookingForm').hidden = true;
    document.querySelector('.booking__aside').hidden = true;
    document.querySelector('.booking__choice').hidden = true;
    const success = $('#bookingSuccess');
    success.hidden = false;
    $('#bookingSuccessText').textContent =
      `${kind === 'moede' ? 'Dit møde' : 'Dit arrangement'} er booket ${S.formatDate(iso).toLowerCase()} kl. ${time}. Vi ringer til dig på ${phone} og bekræfter hurtigst muligt.`;
    success.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  $('#bookAgainBtn').addEventListener('click', () => {
    $('#bookingSuccess').hidden = true;
    const form = $('#bookingForm');
    form.hidden = false;
    form.reset();
    document.querySelector('.booking__aside').hidden = false;
    document.querySelector('.booking__choice').hidden = false;
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
    /* genopfrisk datolisten (lagerstatus), medmindre man er midt i formularen */
    const form = $('#orderForm');
    if (!form.hidden && !form.contains(document.activeElement)) {
      const prev = orderDate.value;
      renderOrderDates();
      if ([...orderDate.options].some((o) => o.value === prev && !o.disabled)) {
        orderDate.value = prev;
        onOrderDateChange();
      }
    }
  });
})();
