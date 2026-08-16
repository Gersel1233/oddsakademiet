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

  /* bestillingsvinduet – FORSKELLIGT pr. type: to-go til kl. 19,
     spis her til kl. 20:30 (kan ændres i admin) */
  /* tiderne er DAGENS – en enkelt dag kan have sit eget vindue,
     fx "mandag åbner vi først 17:30" */
  /* slås op i DOM'en, ikke i variablen: variablen findes først længere
     nede i filen, og et opslag på den før tid ville kaste en fejl */
  const valgtDato = () => {
    const el = document.getElementById('orderDate');
    return (el && el.value) || '';
  };
  const orderFrom = (iso) => S.orderFromFor(iso || valgtDato());
  const orderTo = (type, iso) => S.orderToFor(type || currentType(), iso || valgtDato());

  /* køkkenets tilstand lige nu (styret af det SENESTE vindue = spis her) */
  function kitchenStateToday() {
    const h = S.hoursFor(S.todayISO());
    if (h.closed) return 'lukket';
    const now = nowMin();
    const iDag = S.todayISO();
    if (now > toMin(S.orderToFor('spise', iDag))) return 'lukket';
    if (now >= toMin(orderFrom(iDag))) return 'aaben';
    return 'foer';
  }

  /* afhentningstider for en dag OG den valgte type – i dag vises kun
     fremtidige tider (min. 20 min. varsel), så dagen "udløber" af sig selv */
  function slotsFor(iso, type) {
    let slots = S.orderSlots(iso, 30, type || currentType());
    if (iso === S.todayISO()) {
      const cutoff = nowMin() + 20;
      slots = slots.filter((t) => toMin(t) >= cutoff);
    }
    return slots;
  }

  /* er dagen reelt slut for madbestillinger? (målt på det længste vindue) */
  const dayDone = (iso) => iso === S.todayISO() && slotsFor(iso, 'spise').length === 0;

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
  /* vis videoen så snart der er et billede – både når den "playing" og når
     første frame er klar. Play-knappen er skjult i CSS. */
  const revealHero = () => heroVideo.classList.add('is-playing');
  heroVideo.addEventListener('playing', revealHero, { once: true });
  heroVideo.addEventListener('loadeddata', revealHero, { once: true });
  /* de første ~0,5 s af optagelsen står stille – dem springer vi over,
     både ved start og hver gang videoen looper forfra */
  const HERO_START = 0.5;
  const skipStill = () => {
    if (heroVideo.currentTime < HERO_START - 0.1) {
      try { heroVideo.currentTime = HERO_START; } catch { /* endnu ikke klar */ }
    }
  };
  heroVideo.addEventListener('loadedmetadata', skipStill);
  heroVideo.addEventListener('timeupdate', skipStill);
  /* muted SKAL sættes i JS på iOS, ellers nægter den at autoplay'e */
  heroVideo.muted = true;
  if (!heroVideo.getAttribute('src')) heroVideo.src = heroVideo.dataset.src;
  const tryPlay = () => { const p = heroVideo.play?.(); if (p) p.catch(() => {}); };
  tryPlay();
  heroVideo.addEventListener('canplay', tryPlay, { once: true });

  /* Nogle telefoner nægter at auto-starte en video, før brugeren har rørt
     skærmen (fx strøm-spare-tilstand / streng autoplay-politik). Derfor sætter
     vi den i gang ved den ALLERførste handling – berøring, scroll, klik – så
     den starter stort set med det samme, i stedet for først når man scroller. */
  const kickHero = () => {
    if (hero.classList.contains('is-offscreen')) return;
    heroVideo.muted = true;
    const p = heroVideo.play?.();
    if (p) p.catch(() => {});
  };
  ['touchstart', 'pointerdown', 'click', 'scroll', 'keydown'].forEach((ev) =>
    window.addEventListener(ev, kickHero, { once: true, passive: true }));

  /* iOS Safari viser kun :active-tryk-effekter, hvis siden har en (blivende)
     touch-lytter – denne tomme, passive lytter tænder for klik-følelsen */
  document.addEventListener('touchstart', () => {}, { passive: true });

  /* ---------- nominerings-stribe (Greve Business Awards) ----------
     Vises kun frem til udløbsdatoen og forsvinder så helt af sig selv.
     Den enkelte besøgende kan også skjule den med ✕. */
  (() => {
    const el = $('#awardBanner');
    if (!el) return;
    const UNTIL = '2026-09-05'; /* ← auto-skjul fra denne dato (om ~1 måned) */
    let dismissed = false;
    try { dismissed = localStorage.getItem('spiis-award') === 'x'; } catch { /* privat-tilstand */ }
    if (S.todayISO() < UNTIL && !dismissed) el.hidden = false;
    const close = $('#awardClose');
    if (close) close.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      el.hidden = true;
      try { localStorage.setItem('spiis-award', 'x'); } catch { /* ignore */ }
    });
  })();

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
    const orderBtn = $('#todayOrderBtn');

    /* ferie: hele dagens ret-sektionen viser luk-beskeden i stedet for en ret */
    if (S.isClosureNow()) {
      const c = S.getClosure();
      $('#todayLabel').textContent = '🌴 Ferielukket';
      $('#todayDish').textContent = 'Vi holder lukket for bestillinger';
      $('#todayDesc').textContent = (c.message ? c.message + ' ' : '')
        + (c.reopen ? `Vi åbner for bestillinger igen ${S.formatDate(c.reopen)}.` : '');
      $('#todayPrice').textContent = '';
      $('#todayStock').textContent = '';
      $('#todayStock').className = 'today__stock';
      if (orderBtn) { orderBtn.textContent = 'Send forespørgsel'; orderBtn.setAttribute('href', '#selskaber'); }
      return;
    }
    if (orderBtn) { orderBtn.textContent = 'Bestil dagens ret'; orderBtn.setAttribute('href', '#bestil'); }

    let iso = today;
    /* efter køkkenets lukketid er dagen slut – og dage med privat
       arrangement springes over, for dér kan man ikke bestille */
    let dishes = (dayDone(today) || S.isOrderingClosed(today)) ? [] : S.getDagensRetList(iso);

    /* hvis der ikke er en ret (eller dagen er slut), så vis den næste planlagte */
    if (!dishes.length) {
      for (let i = 1; i <= 14 && !dishes.length; i++) {
        iso = S.addDays(today, i);
        if (S.isOrderingClosed(iso)) continue;
        dishes = S.getDagensRetList(iso);
      }
    }
    const dish = dishes[0] || null;

    const label = $('#todayLabel');
    const title = $('#todayDish');
    const desc = $('#todayDesc');
    const price = $('#todayPrice');
    const stockEl = $('#todayStock');

    /* billedet er frivilligt: er der intet, forsvinder feltet helt, og
       kortet står nøjagtig som før. Med flere retter samme dag viser vi
       ikke noget billede – så ved man ikke hvilken ret det hører til. */
    const fotoBoks = $('#todayFoto');
    const fotoUrl = (dishes.length === 1 && dish && dish.img) ? dish.img : '';
    if (fotoBoks) {
      fotoBoks.hidden = !fotoUrl;
      document.querySelector('.today')?.classList.toggle('today--foto', !!fotoUrl);
      if (fotoUrl) {
        const im = $('#todayFotoImg');
        im.src = fotoUrl;
        im.alt = dish.title;
        im.loading = 'lazy';
      }
    }

    if (!dish) {
      label.textContent = 'Dagens ret';
      title.textContent = 'Vi opdaterer menuen lige nu';
      desc.textContent = 'Kig forbi snart – eller ring til os og hør, hvad der er på menuen.';
      price.textContent = '';
      stockEl.textContent = '';
      return;
    }
    label.textContent = iso === today ? 'I dag' : S.formatDate(iso);
    title.textContent = dishes.length > 1 ? dishes.map((d) => d.title).join(' · ') : dish.title;
    desc.innerHTML = dishes.length > 1 ? '' : descHtml(dish.desc || '');
    price.textContent = dishes.length === 1 && dish.price ? kr(dish.price) : '';

    /* med flere retter: udsolgt først når ALLE er udsolgte; "få tilbage"
       vises for den ret, der er tættest på at slippe op */
    stockEl.className = 'today__stock';
    if (dishes.length > 1 && S.dagensAllSoldOut(iso)) {
      stockEl.textContent = 'Udsolgt i dag – vi ses i morgen!';
      stockEl.classList.add('is-soldout');
    } else if (dishes.length > 1) {
      const low = dishes
        .map((d) => ({ t: d.title, r: S.getRemainingFor(iso, d.title) }))
        .filter((x) => x.r !== null && x.r > 0 && x.r <= 5)
        .sort((a, b) => a.r - b.r)[0];
      stockEl.textContent = low ? `🔥 Kun ${low.r} × ${low.t} tilbage!` : '';
      if (low) stockEl.classList.add('is-low');
    } else {
      const remaining = S.getRemainingFor(iso, dish.title);
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
    /* pulserende "live"-prik mens køkkenet er åbent i dag */
    if (iso === today && stockEl.textContent && !stockEl.classList.contains('is-soldout')
        && kitchenStateToday() === 'aaben') {
      stockEl.classList.add('is-live');
    }
  }

  /* beskrivelser kan skrives i PUNKTFORM: hver linje bliver sit eget punkt
     (fx alt hvad en tapas-tallerken indeholder) */
  function descHtml(desc) {
    const lines = String(desc || '').split('\n').map((l) => l.replace(/^[-•·*]\s*/, '').trim()).filter(Boolean);
    if (lines.length <= 1) return esc(desc || '');
    return `<ul class="descpoints">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
  }

  /* Hvad står der på en lukket dag? Har køkkenet sat sin egen forklaring
     i kalenderen (fx 👥 Personaletur), er DEN sandheden – ellers gætter
     vi så præcist som de offentlige data tillader. */
  function lukketTekst(iso) {
    const mark = S.getDayMark && S.getDayMark(iso);
    if (mark && mark.e) return `${mark.e} ${mark.t || 'Lukket'}`;
    if (S.isInClosure(iso)) return '🌴 Ferielukket';
    if ((S.getArrangementDates() || []).includes(iso)) return '🎉 Privat arrangement';
    return '🚫 Lukket';
  }

  function renderWeekPlan() {
    const grid = $('#weekPlan');
    const plan = S.getPlan(7);
    grid.innerHTML = plan.map((day) => {
      const isToday = day.iso === S.todayISO();
      if (!day.open) {
        return `<button type="button" class="dayplan dayplan--closed" data-day="${day.iso}">
          <span class="dayplan__day">${day.weekday}${isToday ? ' · i dag' : ''}</span>
          <span class="dayplan__date">${esc(S.formatDate(day.iso, false))}</span>
          <span class="dayplan__dish">Lukket</span>
        </button>`;
      }
      if (S.isOrderingClosed(day.iso)) {
        return `<button type="button" class="dayplan dayplan--closed" data-day="${day.iso}">
          <span class="dayplan__day">${day.weekday}${isToday ? ' · i dag' : ''}</span>
          <span class="dayplan__date">${esc(S.formatDate(day.iso, false))}</span>
          <span class="dayplan__dish">${esc(lukketTekst(day.iso))}</span>
          <span class="dayplan__desc">Lukket for bestillinger denne dag.</span>
        </button>`;
      }
      const dishes = day.dishes || [];
      /* én ret: som altid. Flere retter: en linje pr. ret med eget udsolgt/få-tilbage-mærke */
      let dishHtml;
      if (!dishes.length) {
        /* dage i en SENERE uge er ikke planlagt endnu – køkkenet lægger
           ugens menu op hen over weekenden. Sig det, i stedet for et
           uklart "følger snart", så folk ved hvornår de skal kigge igen. */
        dishHtml = S.weekStart(day.iso) > S.weekStart(S.todayISO())
          ? '<span class="dayplan__dish dayplan__dish--kommer">Menuen for den uge lægges op i løbet af weekenden</span>'
          : '<span class="dayplan__dish">Dagens ret følger snart…</span>';
      } else if (dishes.length === 1) {
        const d0 = dishes[0];
        const rem = S.getRemainingFor(day.iso, d0.title);
        let stockTag = '';
        if (rem !== null && rem <= 0) stockTag = '<span class="dayplan__tag dayplan__tag--soldout">Udsolgt</span>';
        else if (rem !== null && rem <= 5) stockTag = `<span class="dayplan__tag">Kun ${rem} tilbage</span>`;
        dishHtml = `<span class="dayplan__dish">${esc(d0.title)}</span>
          ${d0.desc ? `<span class="dayplan__desc">${descHtml(d0.desc)}</span>` : ''}
          ${d0.price ? `<span class="dayplan__price">${kr(d0.price)}</span>` : ''}
          ${stockTag}`;
      } else {
        dishHtml = dishes.map((d) => {
          const rem = S.getRemainingFor(day.iso, d.title);
          const tag = rem !== null && rem <= 0
            ? ' <span class="dayplan__tag dayplan__tag--soldout">Udsolgt</span>'
            : (rem !== null && rem <= 5 ? ` <span class="dayplan__tag">Kun ${rem} tilbage</span>` : '');
          return `<span class="dayplan__dish dayplan__dish--multi">${esc(d.title)}${d.price ? ` <em class="dayplan__inlineprice">${kr(d.price)}</em>` : ''}${tag}</span>`;
        }).join('');
      }
      return `<button type="button" class="dayplan" data-day="${day.iso}">
        <span class="dayplan__day">${day.weekday}${isToday ? ' · i dag' : ''}</span>
        <span class="dayplan__date">${esc(S.formatDate(day.iso, false))}</span>
        ${dishHtml}
        <span class="dayplan__mere">Se hele dagen →</span>
      </button>`;
    }).join('');
  }

  /* ============================================================
     HELE DAGEN I ET VINDUE
     Kortene i ugeoversigten er små, så en lang beskrivelse bliver
     klippet af. Tryk på en dag og få det hele at læse – og en genvej
     direkte til bestillingen for netop den dag.
     ============================================================ */
  const dayInfoWrap = $('#dayInfoWrap');
  let dayInfoIso = null;

  function closeDayInfo() {
    dayInfoWrap.hidden = true;
    document.body.style.overflow = '';
    dayInfoIso = null;
  }

  function openDayInfo(iso) {
    dayInfoIso = iso;
    const åben = S.isOpenDay(iso) && !S.isOrderingClosed(iso);
    const dishes = S.getDagensRetList(iso);
    const timer = S.getHours()[S.weekdayIndex(iso)];

    $('#dayInfoKicker').textContent = iso === S.todayISO() ? 'I dag' : 'Dagens ret';
    $('#dayInfoTitle').textContent = S.formatDate(iso);

    let krop;
    if (!åben) {
      krop = `<p class="daycard__lukket">${esc(lukketTekst(iso))}</p>
        <p class="daycard__note">Vi tager ikke imod bestillinger denne dag – vælg en anden dag, så er vi klar. 💛</p>`;
    } else if (!dishes.length) {
      krop = S.weekStart(iso) > S.weekStart(S.todayISO())
        ? '<p class="daycard__note">🗓️ Menuen for den uge er ikke lagt op endnu. Køkkenet planlægger ugen hen over weekenden – kig forbi igen søndag eller mandag.</p>'
        : '<p class="daycard__note">Dagens ret er ikke lagt ind endnu – kig forbi igen, eller ring til os på 93 99 58 58.</p>';
    } else {
      krop = dishes.map((d) => {
        const rem = S.getRemainingFor(iso, d.title);
        const tag = rem !== null && rem <= 0
          ? '<span class="dayplan__tag dayplan__tag--soldout">Udsolgt</span>'
          : (rem !== null && rem <= 5 ? `<span class="dayplan__tag">Kun ${rem} tilbage</span>` : '');
        return `<div class="daycard__ret">
          <div class="daycard__navn">${esc(d.title)}${d.price ? `<span class="daycard__pris">${kr(d.price)}</span>` : ''}</div>
          ${d.desc ? `<div class="daycard__desc">${descHtml(d.desc)}</div>` : ''}
          ${valgFor(d).length ? `<div class="daycard__valg">Vælg mellem: ${valgFor(d).map((v) => `${esc(v.navn)}${Number(v.pris) ? ` (+ ${kr(Number(v.pris))})` : ''}`).join(' · ')}</div>` : ''}
          ${tag}
        </div>`;
      }).join(dishes.length > 1 ? '<div class="daycard__eller">eller</div>' : '');
      krop += `<p class="daycard__note">🕐 Afhentning kl. ${esc(orderFrom(iso))}–${esc(orderTo(null, iso))}${timer && !timer.closed ? ` · køkkenet har åbent ${esc(timer.open)}–${esc(timer.close)}` : ''}</p>`;
    }
    $('#dayInfoBody').innerHTML = krop;

    const cta = $('#dayInfoOrder');
    cta.hidden = !(åben && dishes.length);
    dayInfoWrap.hidden = false;
    document.body.style.overflow = 'hidden';
    $('#dayInfoClose').focus();
  }

  $('#weekPlan').addEventListener('click', (e) => {
    const kort = e.target.closest('[data-day]');
    if (kort) openDayInfo(kort.dataset.day);
  });
  $('#dayInfoClose').addEventListener('click', closeDayInfo);
  dayInfoWrap.addEventListener('click', (e) => { if (e.target === dayInfoWrap) closeDayInfo(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !dayInfoWrap.hidden) closeDayInfo();
  });
  $('#dayInfoOrder').addEventListener('click', () => {
    const iso = dayInfoIso;
    closeDayInfo();
    const sel = $('#orderDate');
    if (sel && [...sel.options].some((o) => o.value === iso)) {
      sel.value = iso;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    document.getElementById('bestil').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

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
      const iDag = S.todayISO();
      kitchenNote.textContent = `🥡 To-go: kl. ${orderFrom(iDag)} – ${S.orderToFor('togo', iDag)} · 🍽️ Spis her: kl. ${orderFrom(iDag)} – ${S.orderToFor('spise', iDag)}`;
    }

    /* tydelig deadline til kunden: hvor længe kan man nå at bestille til i dag.
       Bruger PRÆCIS samme tider som selve bestillingen, så det aldrig kan vise
       et andet tal end det, systemet faktisk tillader. */
    const cutoffEl = $('#orderCutoff');
    if (cutoffEl) {
      const todayIso = S.todayISO();
      const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      const deadlineFor = (type) => {
        const daySlots = S.orderSlots(todayIso, 30, type);
        const lastSlot = daySlots[daySlots.length - 1];
        if (!lastSlot) return null;
        return { deadline: toMin(lastSlot) - 20, open: slotsFor(todayIso, type).length > 0 };
      };
      const tg = deadlineFor('togo');
      const sp = deadlineFor('spise');
      if (S.isClosureNow() || hours[todayIdx].closed || S.isOrderingClosed(todayIso) || (!tg && !sp)) {
        cutoffEl.hidden = true; /* ferie, lukket dag eller intet vindue i dag → ingen linje */
      } else if ((tg && tg.open) || (sp && sp.open)) {
        const parts = [];
        if (tg && tg.open) parts.push(`to-go frem til kl. ${fmt(tg.deadline)}`);
        if (sp && sp.open) parts.push(`spis her frem til kl. ${fmt(sp.deadline)}`);
        cutoffEl.textContent = `🕐 Bestil til i dag: ${parts.join(' · ')}`;
        cutoffEl.className = 'hours__cutoff';
        cutoffEl.hidden = false;
      } else {
        cutoffEl.textContent = '🕐 Bestillinger til i dag er lukket – vælg en kommende dag';
        cutoffEl.className = 'hours__cutoff is-closed';
        cutoffEl.hidden = false;
      }
    }

    const status = $('#openStatus');
    const h = hours[todayIdx];
    const now = nowMin();
    const oTo = toMin(S.orderToFor('spise', S.todayISO()));
    if (h.closed) {
      status.textContent = '● Vi holder lukket i dag';
      status.className = 'hours__status is-closed';
    } else if (now < toMin(h.open)) {
      status.textContent = `● Vi har lukket lige nu – vi åbner kl. ${h.open}`;
      status.className = 'hours__status is-closed';
    } else if (now <= toMin(h.close)) {
      if (now > oTo) {
        status.textContent = `● Køkkenet er lukket for bestillinger i dag – vi har åbent til kl. ${h.close}`;
        status.className = 'hours__status is-soon';
      } else if (toMin(h.close) - now <= 60) {
        status.textContent = `● Vi lukker snart – åbent til kl. ${h.close}`;
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
  /* ÉT sted der bestemmer hvordan en linje hedder – så kurven,
     kvitteringen, sms'en og køkkenets seddel altid siger det samme */
  const linjeNavn = (l) => `${l.name}${l.valg ? ` · ${l.valg}` : ''}`;

  /* ---------- emballage ved to-go ----------
     10 kr. pr. ret (ikke drikkevarer og dip). Tager kunden sin
     tidligere emballage med til dagens ret, er dén del gratis. */
  const EMBALLAGE_PRIS = 10;
  const currentType = () => ($('input[name="orderType"]:checked') || {}).value || 'togo';
  const reuseChecked = () => !!($('#reuseBox') && $('#reuseBox').checked);
  const needsPackaging = (l) =>
    l.kind === 'dagensret' || (l.kind === 'menu' && !/drik/i.test(l.cat || '') && !/dip/i.test(l.name || ''));

  function packagingCount(includeDagens) {
    return basketLines().reduce((s, l) => {
      if (!needsPackaging(l)) return s;
      if (l.kind === 'dagensret' && !includeDagens) return s;
      return s + l.qty;
    }, 0);
  }

  /* samlet antal dagens ret(ter) i kurven – på tværs af flere retter */
  function dagensQtyInBasket() {
    return basketLines().filter((l) => l.kind === 'dagensret').reduce((s, l) => s + l.qty, 0);
  }

  /* varelinjerne der faktisk sendes: kurven + evt. emballage/genbrug */
  function orderSendLines() {
    const lines = basketLines().slice();
    if (currentType() !== 'togo') return lines;
    const dagensQty = dagensQtyInBasket();
    const reuse = reuseChecked() && dagensQty > 0;
    const packs = packagingCount(!reuse);
    if (packs > 0) lines.push({ name: 'Emballage (to-go)', qty: packs, price: EMBALLAGE_PRIS, kind: 'emballage', cat: 'Emballage' });
    if (reuse) lines.push({ name: '♻️ Egen emballage til dagens ret', qty: dagensQty, price: 0, kind: 'genbrug', cat: 'Emballage' });
    return lines;
  }

  function renderOrderDates() {
    const plan = S.getPlan(14);
    const options = plan
      .filter((d) => d.open && slotsFor(d.iso, 'spise').length > 0 && !S.isOrderingClosed(d.iso))
      .map((d) => {
        const dishes = d.dishes || [];
        const soldOut = dishes.length > 0 && S.dagensAllSoldOut(d.iso);
        const what = dishes.length
          ? `${dishes[0].title}${dishes.length > 1 ? ` +${dishes.length - 1}` : ''}${soldOut ? ' (udsolgt)' : ''}`
          : 'menukort';
        const label = `${d.iso === S.todayISO() ? 'I dag – ' : ''}${S.formatDate(d.iso)} · ${what}`;
        return `<option value="${d.iso}">${esc(label)}</option>`;
      });
    orderDate.innerHTML = options.length
      ? options.join('')
      : `<option value="">${S.isClosureNow() ? 'Lukket for bestillinger lige nu' : 'Ingen dage åbne for bestilling lige nu'}</option>`;
    onOrderDateChange();
  }

  /* ============================================================
     NOGLE DAGE ER KUN DEN ENE MÅDE MULIG
     Fx "på torsdag kan man kun bestille take-away". Så skal den
     anden knap ikke bare give en fejl til sidst – den skal slet
     ikke kunne vælges, og der skal stå hvorfor.
     ============================================================ */
  const TYPENAVN = { togo: 'Take-away', spise: 'Spis her' };
  function syncOrderTypes(iso) {
    const knapper = $$('input[name="orderType"]');
    if (!knapper.length) return;
    const aabne = iso && S.openTypesFor ? S.openTypesFor(iso) : ['togo', 'spise'];
    /* er dagen helt lukket, rører vi ikke ved knapperne – den besked
       hører til datoen, ikke til måden man vil spise på */
    const kunHelDagLukket = iso && !aabne.length;
    knapper.forEach((r) => {
      const lukket = !kunHelDagLukket && !aabne.includes(r.value);
      r.disabled = lukket;
      const label = r.closest('label');
      if (label) label.classList.toggle('is-lukket', lukket);
      if (label) label.title = lukket ? `${TYPENAVN[r.value]} er ikke muligt denne dag` : '';
    });
    /* stod man på den lukkede, flyttes man til den der er åben */
    const valgt = knapper.find((r) => r.checked);
    if (valgt && valgt.disabled) {
      const åben = knapper.find((r) => !r.disabled);
      if (åben) åben.checked = true;
    }
    const note = $('#typeLukketNote');
    if (note) {
      const lukkede = knapper.filter((r) => r.disabled).map((r) => TYPENAVN[r.value]);
      note.hidden = !lukkede.length;
      note.textContent = lukkede.length
        ? `${lukkede.join(' og ')} er ikke muligt denne dag – vælg en anden dag, hvis I hellere vil det.`
        : '';
    }
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
    const dishes = S.getDagensRetList(iso);
    const dish = dishes[0] || null;
    const remaining = dish ? S.getRemainingFor(iso, dish.title) : null;
    let hint = dish
      ? (dishes.length > 1
          ? `Dagens retter: ${dishes.map((d) => d.title).join(' · ')}`
          : `Dagens ret: ${dish.title}${dish.price ? ` · ${kr(dish.price)}` : ''}`)
      : 'Ingen dagens ret denne dag – vælg frit fra menukortet.';
    if (dish && dishes.length === 1 && remaining !== null) hint += remaining > 0 ? ` · ${remaining} tilbage` : ' · udsolgt';
    orderDishHint.textContent = hint;
    orderDishHint.className = `field__hint ${dish && remaining !== null && remaining <= 5 ? (remaining <= 0 ? 'is-bad' : 'is-ok') : ''}`;
    if (iso === S.todayISO() && dish && remaining !== null && remaining > 0 && kitchenStateToday() === 'aaben') {
      orderDishHint.classList.add('is-live');
    }

    syncOrderTypes(iso);
    renderBuilder();

    /* kun fremtidige tider – to-go stopper kl. 19:30, spis her kl. 20:30 */
    const prev = orderTime.value;
    const slots = slotsFor(iso);
    orderTime.innerHTML = slots.map((t) => `<option value="${t}">kl. ${t}</option>`).join('');
    if (slots.includes(prev)) orderTime.value = prev;
    else if (slots.includes('17:30')) orderTime.value = '17:30';
  }
  orderDate.addEventListener('change', onOrderDateChange);

  /* ============================================================
     VALGMULIGHEDER PÅ DAGENS RET
     "Bao med nakkefilet – vælg mellem almindelig bolle eller
     salatwrap." Køkkenet skriver mulighederne ind i admin; her får
     hver mulighed sin egen tæller, så en familie kan bestille to af
     den ene og én af den anden i samme bestilling. Har retten ingen
     muligheder, ser den ud og virker præcis som før.
     ============================================================ */
  const valgFor = (d) => (Array.isArray(d && d.valg) ? d.valg.filter((v) => v && v.navn) : []);
  const valgNoegle = (titel, valgNavn) => `d::${titel}::${valgNavn}`;
  /* hvor mange af SAMME ret ligger allerede i kurven under en anden
     mulighed? De trækker fra det samme antal portioner. */
  function andreValgAfSammeRet(titel, undtagNoegle) {
    return Object.entries(basket).reduce((sum, [k, l]) => (
      k !== undtagNoegle && k.startsWith(`d::${titel}::`) ? sum + Number(l.qty || 0) : sum), 0);
  }

  /* kurv-opbyggeren: dagens ret øverst, menukortets kategorier under */
  function renderBuilder() {
    const iso = orderDate.value;
    const dishes = iso ? S.getDagensRetList(iso) : [];
    const menu = S.getMenu();
    const wIdx = iso ? S.weekdayIndex(iso) : 0;
    const weekend = wIdx >= 5;

    /* indeks over alt, der kan bestilles på den valgte dag –
       hver dagens ret får sin egen nøgle, så flere retter pr. dag virker */
    builderIndex = {};
    delete basket.dagens; /* gammel nøgle fra før flere-retter – ryd altid */
    dishes.forEach((d) => {
      const rem = S.getRemainingFor(iso, d.title);
      const valg = valgFor(d);
      if (!valg.length) {
        /* ret uden valgmuligheder – præcis som før */
        builderIndex['d::' + d.title] = {
          name: d.title, price: d.price ?? null, kind: 'dagensret', cat: 'Dagens ret',
          soldout: rem !== null && rem <= 0, left: rem,
        };
        return;
      }
      /* ret MED valgmuligheder: hver mulighed får sin egen linje, så man
         kan bestille fx to almindelige og én glutenfri på én gang */
      valg.forEach((v) => {
        builderIndex[valgNoegle(d.title, v.navn)] = {
          name: d.title, valg: v.navn,
          price: (d.price ?? 0) + Number(v.pris || 0),
          tillaeg: Number(v.pris || 0),
          kind: 'dagensret', cat: 'Dagens ret',
          soldout: rem !== null && rem <= 0, left: rem,
        };
      });
    });
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
      if (inf.left != null && basket[key].qty > Number(inf.left)) {
        basket[key].qty = Number(inf.left);
        if (!basket[key].qty) delete basket[key];
      }
    });

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
    dishes.forEach((d) => {
      const valg = valgFor(d);
      const inf = builderIndex[valg.length ? valgNoegle(d.title, valg[0].navn) : 'd::' + d.title];
      const rem = inf.left;
      const hoved = `
        <div class="bitem__info">
          <strong>${esc(d.title)}<span class="menuline__badge">Dagens ret</span>${rem !== null && rem > 0 && rem <= 5 ? `<span class="menuline__badge menuline__badge--few">Kun ${rem} tilbage</span>` : ''}</strong>
          ${d.desc ? `<small>${esc(d.desc)}</small>` : ''}
          ${d.price ? `<em>${kr(d.price)}</em>` : ''}
        </div>`;
      if (!valg.length) {
        html += `<div class="builder__dagens">
          ${hoved}
          ${inf.soldout ? '<span class="builder__soldout">Udsolgt</span>' : stepper('d::' + d.title, rem)}
        </div>`;
        return;
      }
      /* én linje pr. mulighed – vælg antal af hver */
      html += `<div class="builder__dagens builder__dagens--valg">
        ${hoved}
        ${inf.soldout ? '<span class="builder__soldout">Udsolgt</span>' : `
        <div class="valgliste">
          <span class="valgliste__titel">Vælg hvilken:</span>
          ${valg.map((v) => {
            const key = valgNoegle(d.title, v.navn);
            const brugtAndre = andreValgAfSammeRet(d.title, key);
            const maxHer = rem === null ? null : Math.max(0, rem - brugtAndre);
            return `
            <div class="valgrow">
              <span class="valgrow__navn">${esc(v.navn)}${Number(v.pris) ? `<em class="valgrow__tillaeg">+ ${kr(Number(v.pris))}</em>` : ''}</span>
              ${stepper(key, maxHer)}
            </div>`;
          }).join('')}
        </div>`}
      </div>`;
    });
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
    let max = key.startsWith('d::')
      ? S.getRemainingFor(orderDate.value, info.name)
      : (info.left != null ? Number(info.left) : 50);
    /* har retten valgmuligheder, deler de det SAMME antal portioner */
    if (max !== null && info.valg) max = Math.max(0, max - andreValgAfSammeRet(info.name, key));
    if (max !== null && next > max) next = max;
    if (next <= 0) delete basket[key];
    else {
      basket[key] = { name: info.name, qty: next, price: info.price, kind: info.kind, cat: info.cat };
      if (info.valg) basket[key].valg = info.valg;
    }
    renderBuilder();
  });

  function renderBasketBar() {
    const lines = basketLines();
    syncPackagingUi();
    if (!lines.length) { basketBar.hidden = true; return; }
    basketBar.hidden = false;
    const sendLines = orderSendLines();
    const totalItems = lines.reduce((s, l) => s + l.qty, 0);
    const total = sendLines.reduce((s, l) => s + (l.price ? l.price * l.qty : 0), 0);
    const packLine = sendLines.find((l) => l.kind === 'emballage');
    const reuseLine = sendLines.find((l) => l.kind === 'genbrug');
    basketBar.innerHTML = `<strong>Jeres bestilling:</strong> ${lines.map((l) => `${l.qty} × ${esc(linjeNavn(l))}`).join(' · ')}
      ${packLine ? `<span class="basketbar__pack">+ emballage ${packLine.qty} × ${EMBALLAGE_PRIS} kr.</span>` : ''}
      ${reuseLine ? '<span class="basketbar__pack basketbar__pack--free">♻️ egen emballage til dagens ret</span>' : ''}
      <span class="basketbar__total">${totalItems} ret${totalItems === 1 ? '' : 'ter'}${total ? ` · i alt ${total} kr.` : ''}</span>`;
  }

  /* vis/skjul genbrugs-fluebenet og forklar emballage-tillægget */
  function syncPackagingUi() {
    const reuseWrap = $('#reuseWrap');
    const packHint = $('#packHint');
    if (!reuseWrap || !packHint) return;
    const togo = currentType() === 'togo';
    const packs = packagingCount(true);
    reuseWrap.hidden = !(togo && dagensQtyInBasket() > 0);
    if (reuseWrap.hidden && $('#reuseBox')) $('#reuseBox').checked = false;
    packHint.hidden = !(togo && packs > 0);
    packHint.textContent = togo && packs > 0
      ? `Ved to-go lægges emballage til: ${EMBALLAGE_PRIS} kr. pr. ret (gælder ikke drikkevarer og dip).`
      : '';
  }

  /* skift af to-go/spis her: emballagen OG tiderne følger med
     (to-go kan senest vælges kl. 19:30, spis her kl. 20:30) */
  $$('input[name="orderType"]').forEach((r) => r.addEventListener('change', onOrderDateChange));
  $('#reuseBox')?.addEventListener('change', renderBasketBar);

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
    const lines = orderSendLines();

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

    if (time && (time < orderFrom() || time > orderTo())) {
      error.textContent = `Bestillinger kan kun vælges mellem kl. ${orderFrom()} og ${orderTo()} – vælg et tidspunkt i det vindue.`;
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
      <div class="confirm__line"><span><b>${l.qty} ×</b> ${esc(linjeNavn(l))}</span><span>${l.price ? kr(l.price * l.qty) : ''}</span></div>`).join('')
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

    /* dagens ret-tal fra selve linjerne – virker også med flere retter pr. dag */
    const dagensLines = o.lines.filter((l) => l.kind === 'dagensret');
    const dagensQty = dagensLines.reduce((s, l) => s + l.qty, 0);
    const result = await S.addOrder({
      date: o.iso,
      time: o.time,
      qty: dagensQty,
      type: o.type,
      name: o.name,
      phone: o.phone,
      note: o.note,
      dish: dagensLines.length ? dagensLines[0].name : '',
      price: dagensLines.length === 1 ? (dagensLines[0].price ?? null) : null,
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
        error.textContent = `Denne dag er netop blevet lukket for bestillinger (${lukketTekst(o.iso).replace(/^\S+\s/, '').toLowerCase()}) – vælg venligst en anden dag.`;
        if (S.isCloud()) S.refreshPublic();
      } else if (result.reason === 'type-lukket') {
        /* køkkenet har lukket netop den måde, mens kunden sad og skrev */
        error.textContent = `${TYPENAVN[result.type] || 'Den valgte måde'} er desværre ikke muligt denne dag. Vælg den anden mulighed, eller en anden dag.`;
        if (S.isCloud()) S.refreshPublic();
        syncOrderTypes(o.iso);
      } else if (result.reason === 'tid') {
        error.textContent = `Bestillinger kan kun vælges mellem kl. ${orderFrom(o.iso)} og ${orderTo(o.type, o.iso)} den dag – vælg et tidspunkt i det vindue.`;
        onOrderDateChange();
      } else if (result.reason === 'udsolgt') {
        error.textContent = `„${result.item}" er desværre lige blevet udsolgt i dag – den er fjernet fra jeres bestilling, så prøv bare igen.`;
        Object.keys(basket).forEach((k) => { if (basket[k].name === result.item) delete basket[k]; });
        if (S.isCloud()) S.refreshPublic();
      } else if (result.reason === 'antal') {
        error.textContent = `Der er kun ${result.remaining} × „${result.item}" tilbage i dag – antallet i jeres bestilling er sat ned, så tjek og send igen.`;
        ['m::' + result.item, 'd::' + result.item].forEach((k) => {
          if (!basket[k]) return;
          basket[k].qty = Math.max(0, Number(result.remaining));
          if (!basket[k].qty) delete basket[k];
        });
        if (S.isCloud()) S.refreshPublic();
      } else if (result.reason === 'forbi' || result.reason === 'dato') {
        error.textContent = 'Tidspunktet er nået, mens siden stod åben – vælg venligst en ny tid eller en kommende dag.';
        renderOrderDates();
      } else if (result.reason === 'tom' || result.reason === 'mangler' || result.reason === 'ugyldig') {
        error.textContent = 'Tjek lige bestillingen: vælg mindst én ret og udfyld navn og telefon.';
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
      `${o.lines.map((l) => `${l.qty} × ${linjeNavn(l)}`).join(', ')} — til ${o.persons} person${o.persons === 1 ? '' : 'er'} ${o.type === 'togo' ? 'til afhentning' : 'ved bordet'} ${S.formatDate(o.iso).toLowerCase()} kl. ${o.time}. Vi glæder os til at se jer, ${o.name}!`;
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

  /* ---------- selskaber & catering: mail-knappen åbner kundens egen
     mail-app (Gmail, Mail, Outlook …) med adressen sat i "til" og en
     færdig skabelon, så vi altid får dato, antal og ønsker med ---------- */
  function renderSelskabMail() {
    const btn = $('#selskabMail');
    if (!btn) return;
    const s = S.getSettings();
    const subject = 'Selskab hos Spiis';
    /* kort og venlig – markøren lander til sidst, så man bare skriver videre */
    const body = ['Hej Spiis', '', 'Vi vil gerne holde et selskab hos jer 🎉', '', ''].join('\n');
    btn.href = `mailto:${s.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  /* ---------- Spiis Tapas: skal bestilles senest dagen FØR ----------
     Dato-listen starter i morgen, butikken tjekker igen, og databasen
     afviser også selv samme-dags tapas – skudsikkert i tre lag. */
  (function initTapas() {
    const form = $('#tapasForm');
    if (!form) return;
    const price = () => Number(S.getSettings().tapasPrice) || 199;
    const cavaPrice = () => Number(S.getSettings().tapasCavaPrice) || 150;
    const dateSel = $('#tapasDate');
    const timeSel = $('#tapasTime');
    const typeSel = $('#tapasType');

    function fillTimes() {
      const iso = dateSel.value;
      const slots = iso ? S.orderSlots(iso, 30, typeSel.value) : [];
      const prev = timeSel.value;
      timeSel.innerHTML = slots.length
        ? slots.map((t) => `<option value="${t}">kl. ${t}</option>`).join('')
        : '<option value="">–</option>';
      if (prev && [...timeSel.options].some((o) => o.value === prev)) timeSel.value = prev;
    }
    function fillDates() {
      const opts = [];
      for (let i = 1; i <= 14; i++) {
        const iso = S.addDays(S.todayISO(), i);
        if (!S.isOpenDay(iso) || S.isOrderingClosed(iso)) continue;
        opts.push(`<option value="${iso}">${esc(S.formatDate(iso))}</option>`);
      }
      const prev = dateSel.value;
      dateSel.innerHTML = opts.join('') || '<option value="">Ingen ledige dage lige nu</option>';
      if (prev && [...dateSel.options].some((o) => o.value === prev)) dateSel.value = prev;
      fillTimes();
    }
    function updTotal() {
      const n = Math.max(0, Number($('#tapasPersons').value) || 0);
      const cavaQty = Math.max(0, Math.min(20, Number($('#tapasCava').value) || 0));
      const total = n * price() + cavaQty * cavaPrice();
      $('#tapasCavaCard')?.classList.toggle('is-on', cavaQty > 0);
      /* lille ren kvittering, der regner med, mens man vælger */
      $('#tapasSum').innerHTML = n === 0 && cavaQty === 0
        ? '<div class="tsum__line"><span>Vælg antal personer, så regner vi prisen ud her</span></div>'
        : `
        ${n > 0 ? `<div class="tsum__line"><span>${n} × Spiis Tapas</span><b>${n * price()} kr.</b></div>` : ''}
        ${cavaQty > 0 ? `<div class="tsum__line"><span>${cavaQty} × Cava Brut Nature</span><b>${cavaQty * cavaPrice()} kr.</b></div>` : ''}
        <div class="tsum__line tsum__line--total"><span>I alt</span><b>${total} kr.</b></div>`;
      $('#tapasPriceLabel').textContent = `${price()} kr.`;
      $('#tapasDuoLabel').textContent = `${2 * price() + cavaPrice()} kr.`;
      $('#tapasCavaPrice').textContent = `${cavaPrice()} kr.`;
    }
    /* "Det får I"-listen kommer fra admin → Menukort, så den altid passer */
    function renderTapasItems() {
      const el = $('#tapasItems');
      if (!el) return;
      const st = S.getSettings();
      const items = (Array.isArray(st.tapasItems) && st.tapasItems.length) ? st.tapasItems : S.DEFAULT_TAPAS_ITEMS;
      el.innerHTML = items.map((t) => `<li${String(t).length > 28 ? ' class="tapas__item-wide"' : ''}>${esc(t)}</li>`).join('');
    }
    /* − / + på flasker */
    $('#tapasCavaCard').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cava]');
      if (!btn) return;
      const inp = $('#tapasCava');
      inp.value = Math.max(0, Math.min(20, (Number(inp.value) || 0) + Number(btn.dataset.cava)));
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    });
    dateSel.addEventListener('change', fillTimes);
    typeSel.addEventListener('change', fillTimes);
    form.addEventListener('input', updTotal);
    fillDates();
    renderTapasItems();
    updTotal();
    S.subscribe(() => { fillDates(); renderTapasItems(); updTotal(); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#tapasError');
      err.hidden = true;
      const iso = dateSel.value;
      const time = timeSel.value;
      const n = Math.max(0, Number($('#tapasPersons').value) || 0);
      const name = $('#tapasName').value.trim();
      const phone = $('#tapasPhone').value.trim();
      const problems = [];
      if (!iso) problems.push('vælg en dato');
      if (!time) problems.push('vælg et tidspunkt');
      if (n < 1) problems.push('skriv hvor mange personer I er');
      if (!name) problems.push('skriv dit navn');
      if (!/^[\d+\s-]{6,}$/.test(phone)) problems.push('skriv et gyldigt telefonnummer');
      if (problems.length) {
        err.textContent = `Hov! Du mangler at: ${problems.join(', ')}.`;
        err.hidden = false;
        return;
      }
      const cavaQty = Math.max(0, Math.min(20, Number($('#tapasCava').value) || 0));
      const items = [{ name: 'Spiis Tapas', qty: n, price: price(), kind: 'tapas' }];
      if (cavaQty > 0) items.push({ name: 'Cava Brut Nature', qty: cavaQty, price: cavaPrice() });
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Sender…';
      const res = await S.addOrder({
        date: iso, time, qty: n, type: typeSel.value,
        name, phone, note: $('#tapasNote').value.trim(),
        dish: '', price: null, items, persons: n,
      });
      btn.disabled = false;
      btn.textContent = '🧀 Bestil tapas';
      if (!res.ok) {
        /* kunden skal ALTID have at vide hvorfor – aldrig bare
           "noget gik galt", som man ikke kan gøre noget ved */
        const grunde = {
          'tapas-dato': 'Tapas skal bestilles senest dagen før – vælg en dato fra i morgen.',
          pauset: 'Vi tager ikke imod online bestillinger lige nu – ring til os på 93 99 58 58, så finder vi ud af det.',
          lukket: `Vi holder lukket den dag (${lukketTekst(iso).replace(/^\S+\s/, '').toLowerCase()}) – vælg en anden dag.`,
          dag: 'Køkkenet holder lukket den ugedag – vælg en anden dag.',
          tid: 'Vælg et afhentningstidspunkt inden for åbningstiden.',
          forbi: 'Tidspunktet er passeret, mens siden stod åben – vælg en ny tid.',
          dato: 'Vælg en dato fra i morgen og frem.',
          tom: 'Udfyld antal personer, navn og telefon.',
          mangler: 'Udfyld antal personer, navn og telefon.',
          ugyldig: 'Tjek lige antal personer, navn og telefonnummer.',
        };
        err.textContent = (res.error === 'net')
          ? 'Bestillingen kunne ikke sendes lige nu – tjek nettet, prøv igen, eller ring til os på 93 99 58 58.'
          : (grunde[res.reason] || 'Bestillingen kunne ikke sendes lige nu – ring til os på 93 99 58 58, så hjælper vi.');
        err.hidden = false;
        return;
      }
      form.hidden = true;
      const suc = $('#tapasSuccess');
      suc.hidden = false;
      $('#tapasSuccessText').textContent = `Jeres tapas til ${n} ${n === 1 ? 'person' : 'personer'} er bestilt til ${S.formatDate(iso).toLowerCase()} kl. ${time}. Vi glæder os! 🧀`;
      suc.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  })();

  /* ---------- selskabs-billeder: rolig karrusel ----------
     Billederne findes SELV: læg dem i assets/ som selskab-1.jpg,
     selskab-2.jpg … (jpg, jpeg, png eller webp). De billeder der
     findes, kommer med – resten af felterne beholder deres emoji. */
  (function initSelskFotos() {
    const tiles = $$('.selsk__foto');
    if (!tiles.length) return;

    const load = (src) => new Promise((res) => {
      const img = new Image();
      img.onload = () => res(src);
      img.onerror = () => res(null);
      img.src = src;
    });

    (async () => {
      const found = [];
      let stop = false;
      for (let n = 1; n <= 8 && !stop; n++) {
        /* jpg først – det er langt det almindeligste. Kun hvis den ikke
           findes, prøver vi de andre. Ellers ville hver sideindlæsning
           fyre 32 forespørgsler af, hvor de 28 er blindgyder. */
        let hit = await load(`assets/selskab-${n}.jpg`);
        if (!hit) {
          hit = (await Promise.all(
            ['jpeg', 'png', 'webp'].map((ext) => load(`assets/selskab-${n}.${ext}`))
          )).find(Boolean);
        }
        /* første hul = der er ikke flere billeder. Så holder vi op med at
           lede i stedet for at fyre forespørgsler af på alle 8 numre. */
        if (hit) found.push(hit); else stop = true;
      }
      if (!found.length) return; /* ingen billeder endnu – de pæne emoji-felter bliver stående */

      tiles.forEach((tile, ti) => {
        tile.textContent = '';
        tile.classList.add('selsk__foto--has');
        found.forEach((src, i) => {
          const img = document.createElement('img');
          img.src = src;
          img.alt = 'Mad fra et af vores arrangementer';
          img.loading = 'lazy';
          if (i === ti % found.length) img.classList.add('is-show');
          tile.appendChild(img);
        });
      });

      if (found.length < 2) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      let step = 0;
      setInterval(() => {
        step++;
        tiles.forEach((tile, ti) => {
          const imgs = tile.querySelectorAll('img');
          imgs.forEach((img, i) => img.classList.toggle('is-show', i === (ti + step) % imgs.length));
        });
      }, 4200);
    })();
  })();

  /* ---------- personer vs. retter: luk hullet venligt ----------
     4 personer men mad til 2? Kunden får et blidt hint med det samme,
     og køkkenet ser samme advarsel på bestillingen i admin. */
  function updatePersonsHint() {
    const el = $('#personsHint');
    if (!el) return;
    const persons = Number($('#orderPersons')?.value) || 0;
    const foodQty = orderSendLines()
      .filter((l) => l.kind !== 'emballage' && !(l.cat && /drik/i.test(l.cat)))
      .reduce((s, l) => s + Number(l.qty || 0), 0);
    if (currentType() === 'spise' && foodQty > 0 && persons > foodQty) {
      el.textContent = `I er ${persons}, men har valgt mad til ${foodQty} – deler I, er det helt fint. Ellers husk lige flere retter 😊`;
      el.className = 'field__hint is-bad';
    } else {
      el.textContent = '';
      el.className = 'field__hint';
    }
  }
  $('#orderForm')?.addEventListener('input', updatePersonsHint);
  $('#orderForm')?.addEventListener('click', () => setTimeout(updatePersonsHint, 50));

  /* ---------- kontakt fra indstillinger ---------- */
  function renderContact() {
    const s = S.getSettings();
    const tel = `tel:+45${s.phone.replace(/\s/g, '')}`;
    const phoneLink = $('#contactPhone');
    if (phoneLink) {
      phoneLink.href = tel;
      phoneLink.lastElementChild.textContent = s.phone;
    }
    const emailLink = $('#contactEmail');
    if (emailLink) {
      emailLink.href = `mailto:${s.email}`;
      emailLink.lastElementChild.textContent = s.email;
    }
    renderSelskabMail();
  }

  /* ---------- besked hvis den fælles database er nede ----------
     Uden den ville en bestilling kun lande i kundens egen browser
     og aldrig nå køkkenet – så hellere bede folk ringe. */
  function renderCloudNotice() {
    const down = S.isCloudConfigured() && S.isCloudDown();
    const phone = S.getSettings().phone;
    $('#orderOffline').hidden = !down;
    if (down) {
      $('#orderOffline').textContent = `⚠️ Online-bestilling er nede i øjeblikket. Ring til os på ${phone}, så klarer vi det over telefonen.`;
    }
    /* nødbremsen må ALDRIG blive overskrevet her – ellers kunne knappen
       blive tændt igen, selvom chefen har slukket for online bestilling */
    $('#orderForm button[type="submit"]').disabled = down || !!S.getSettings().ordersPaused;
  }

  /* ---------- footer ---------- */
  $('#year').textContent = new Date().getFullYear();

  /* ---------- præcise hop til sektioner ----------
     Sektionerne renderes først, når man nærmer sig dem (hurtig side!),
     men det kan forskyde et anker-hop en anelse. Når scrollet er faldet
     til ro, justerer vi lydløst på plads, så man ALTID lander præcist. */
  function fixAnchorScroll() {
    const id = decodeURIComponent(location.hash.slice(1));
    const el = id && document.getElementById(id);
    if (!el) return;
    let lastY = -1, stable = 0, tries = 0;
    const tick = () => {
      if (++tries > 40) return;
      if (Math.abs(window.scrollY - lastY) < 2) stable++; else stable = 0;
      lastY = window.scrollY;
      if (stable >= 3) {
        const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
        const off = el.getBoundingClientRect().top - margin;
        if (Math.abs(off) > 10) window.scrollTo(0, window.scrollY + off);
        return;
      }
      setTimeout(tick, 90);
    };
    setTimeout(tick, 120);
  }
  window.addEventListener('hashchange', fixAnchorScroll);
  window.addEventListener('load', fixAnchorScroll);

  /* ---------- online bestilling slukket helt (chefens nødbremse) ---------- */
  function renderPause() {
    const s2 = S.getSettings();
    const off = !!s2.ordersPaused;
    document.body.classList.toggle('orders-paused', off);
    const msg = (s2.ordersPausedMsg || '').trim()
      || 'Vi tager ikke imod online bestillinger lige nu – ring til os, så finder vi ud af det. Vi har stadig åbent som normalt.';
    ['#orderPausedNote', '#tapasPausedNote'].forEach((sel) => {
      const el = $(sel);
      if (!el) return;
      el.hidden = !off;
      el.innerHTML = off ? `🛑 <strong>${esc(msg)}</strong><br/><a href="tel:+45${String(s2.phone || '').replace(/\s/g, '')}">📞 Ring på ${esc(s2.phone || '')}</a>` : '';
    });
    /* selve formularerne slås fra, så ingen kan sende alligevel */
    $$('#orderForm, #tapasForm').forEach((f) => {
      f.querySelectorAll('button[type="submit"]').forEach((b) => { b.disabled = off; });
      f.classList.toggle('is-paused', off);
    });
  }

  /* ---------- ferie / luk-periode banner ---------- */
  function renderClosure() {
    const el = $('#closureBanner');
    if (!el) return;
    const c = S.getClosure();
    const today = S.todayISO();
    const activeNow = S.isClosureNow();
    /* varsl også FØR perioden: så ved kunderne det i god tid */
    const upcoming = !!(c.active && c.reopen && !activeNow && c.from && c.from > today);
    document.body.classList.toggle('site-closed', activeNow); /* skjuler "Bestil"-knapper */
    if (!activeNow && !upcoming) { el.hidden = true; el.innerHTML = ''; return; }
    const lastDay = c.reopen ? S.addDays(c.reopen, -1) : '';
    const fromTxt = c.from ? S.formatDate(c.from, false) : '';
    const toTxt = lastDay ? S.formatDate(lastDay, false) : '';
    const reopenTxt = c.reopen ? S.formatDate(c.reopen) : '';
    const reopenLow = reopenTxt ? reopenTxt.charAt(0).toLowerCase() + reopenTxt.slice(1) : '';
    el.innerHTML = `
      <div class="container">
        <article class="feriekort">
          <div class="feriekort__top">
            <span class="feriekort__icon" aria-hidden="true">🌴</span>
            <div>
              <p class="feriekort__eyebrow">${upcoming ? 'Kommende lukkedage' : 'Vi holder lukket'}</p>
              <h3 class="feriekort__period">${fromTxt && toTxt
                ? (fromTxt === toTxt ? esc(fromTxt) : `${esc(fromTxt)} – ${esc(toTxt)}`)
                : (toTxt ? `Til og med ${esc(toTxt)}` : 'Lige nu')}</h3>
            </div>
          </div>
          ${c.message ? `<p class="feriekort__msg">${esc(c.message)}</p>` : ''}
          ${reopenLow ? `<p class="feriekort__back">Vi er tilbage ${esc(reopenLow)} 💛</p>` : ''}
          <ul class="feriekort__facts">
            <li>🍲 ${upcoming
              ? 'Bestillinger er åbne som normalt indtil da – kun de lukkede dage kan ikke vælges'
              : (reopenLow ? `Forudbestil gerne allerede nu – vælg bare en dato fra ${esc(reopenLow)}` : 'Madbestilling er lukket i perioden')}</li>
            <li>📅 Forespørgsler, møder og kontakt er åbne som altid</li>
          </ul>
          <div class="feriekort__cta">
            <a href="#selskaber" class="btn btn--small btn--accent">Skriv til os</a>
            <a href="#kontakt" class="btn btn--small btn--ghost">Kontakt os</a>
          </div>
        </article>
      </div>`;
    el.hidden = false;
  }

  /* ---------- nyheder fra køkkenet (lige under forsiden) ---------- */
  function renderNews() {
    const wrap = $('#nyheder');
    const grid = $('#newsGrid');
    if (!wrap || !grid) return;
    const posts = S.getNews().filter((n) => n.active !== false && n.title);
    wrap.hidden = posts.length === 0;
    if (!posts.length) { grid.innerHTML = ''; return; }
    const today = S.todayISO();
    grid.innerHTML = posts.slice(0, 4).map((n, i) => {
      const past = n.orderable && n.orderBy && today > n.orderBy;
      let action = '';
      if (n.orderable) {
        action = past
          ? '<p class="news__closed">Bestillingsfristen er udløbet</p>'
          : `<button class="btn btn--accent btn--small news__cta" data-news-order="${esc(n.id)}">Bestil${n.price ? ` · ${esc(n.price)} kr.` : ''}</button>`;
      } else if (n.cta) {
        action = '<a href="#bestil" class="btn btn--accent btn--small news__cta">Bestil her</a>';
      }
      /* lange tekster foldes pænt sammen med "Læs mere", så kortene aldrig vælter */
      const longText = (n.text || '').length > 220 || ((n.text || '').match(/\n/g) || []).length > 3;
      return `
      <article class="news ${i === 0 ? 'news--big' : ''}">
        ${n.image ? `<div class="news__media"><img src="${esc(n.image)}" alt="${esc(n.title)}" loading="lazy" /></div>` : ''}
        <div class="news__body">
          ${n.createdAt ? `<p class="news__date">${esc(S.formatDate(n.createdAt.slice(0, 10), false))}</p>` : ''}
          <h3 class="news__title">${esc(n.title)}</h3>
          ${n.text ? `<p class="news__text ${longText ? 'news__text--clamp' : ''}">${esc(n.text)}</p>` : ''}
          ${longText ? '<button class="news__more" type="button" data-news-more>Læs mere ↓</button>' : ''}
          ${n.orderable && n.orderBy && !past ? `<p class="news__deadline">🗓️ Bestil senest ${esc(S.formatDate(n.orderBy, false))}</p>` : ''}
          ${action}
        </div>
      </article>`;
    }).join('');

    /* En plakat i højformat må ALDRIG skæres midt over. Er billedet
       højere end bredt, viser vi det helt – med et blødt, sløret
       bagtæppe af samme billede, så kortet stadig ser færdigt ud. */
    grid.querySelectorAll('.news__media > img').forEach((img) => {
      const tilpas = () => {
        if (!img.naturalWidth || img.naturalHeight <= img.naturalWidth * 1.15) return;
        const boks = img.parentElement;
        boks.classList.add('news__media--plakat');
        boks.style.setProperty('--plakat', `url("${img.currentSrc || img.src}")`);
      };
      if (img.complete) tilpas();
      else img.addEventListener('load', tilpas, { once: true });
    });
  }

  /* "Læs mere" på lange nyheder – folder teksten ud og ind */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('[data-news-more]');
    if (!btn) return;
    const text = btn.closest('.news__body')?.querySelector('.news__text');
    if (!text) return;
    const open = text.classList.toggle('news__text--open');
    text.classList.toggle('news__text--clamp', !open);
    btn.textContent = open ? 'Vis mindre ↑' : 'Læs mere ↓';
  });

  /* ---------- mini-bestilling direkte fra en nyhed ---------- */
  let pendingNews = null;
  const newsWrap = $('#newsOrderWrap');
  function updateNewsTotal() {
    const el = $('#newsOrderTotal');
    if (!el) return;
    if (!pendingNews || !pendingNews.price) { el.textContent = ''; return; }
    const qty = Math.max(1, Number($('#newsOrderQty').value) || 1);
    el.textContent = `I alt: ${qty * Number(pendingNews.price)} kr.`;
  }
  function openNewsOrder(newsId) {
    const n = S.getNews().find((x) => x.id === newsId);
    if (!n || !n.orderable || !newsWrap) return;
    pendingNews = n;
    $('#newsOrderTitle').textContent = 'Bestil: ' + n.title;
    const sub = $('#newsOrderSub');
    sub.textContent = n.price ? `${n.price} kr. pr. stk.` : '';
    sub.hidden = !n.price;
    const dateInp = $('#newsOrderDate');
    dateInp.min = S.todayISO();
    dateInp.value = '';
    $('#newsOrderQty').value = 1;
    $('#newsOrderName').value = '';
    $('#newsOrderPhone').value = '';
    $('#newsOrderError').hidden = true;
    $('#newsOrderForm').hidden = false;
    $('#newsOrderDone').hidden = true;
    $('#newsOrderSend').disabled = false;
    $('#newsOrderSend').textContent = 'Send bestilling';
    updateNewsTotal();
    newsWrap.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeNewsOrder() {
    if (!newsWrap) return;
    newsWrap.hidden = true;
    document.body.style.overflow = '';
    pendingNews = null;
  }
  if (newsWrap) {
    $('#newsGrid').addEventListener('click', (e) => {
      const b = e.target.closest('[data-news-order]');
      if (b) { e.preventDefault(); openNewsOrder(b.dataset.newsOrder); }
    });
    $('#newsOrderClose').addEventListener('click', closeNewsOrder);
    $('#newsOrderDoneClose').addEventListener('click', closeNewsOrder);
    newsWrap.addEventListener('click', (e) => { if (e.target === newsWrap) closeNewsOrder(); });
    $('#newsOrderQty').addEventListener('input', updateNewsTotal);

    $('#newsOrderForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!pendingNews) return;
      const error = $('#newsOrderError');
      error.hidden = true;
      const date = $('#newsOrderDate').value;
      const qty = Number($('#newsOrderQty').value);
      const name = $('#newsOrderName').value.trim();
      const phone = $('#newsOrderPhone').value.trim();
      const fail = (msg) => { error.textContent = msg; error.hidden = false; };
      if (!date) return fail('Vælg en dato.');
      if (!qty || qty < 1) return fail('Vælg et antal.');
      if (!name || !phone) return fail('Udfyld navn og telefon.');
      const btn = $('#newsOrderSend');
      btn.disabled = true; btn.textContent = 'Sender …';
      const res = await S.placeNewsOrder(pendingNews.id, { date, qty, name, phone });
      btn.disabled = false; btn.textContent = 'Send bestilling';
      if (res.ok) {
        $('#newsOrderForm').hidden = true;
        $('#newsOrderDoneText').textContent = `Vi har modtaget din bestilling af ${qty} × ${pendingNews.title} til ${S.formatDate(date, false)}. Vi glæder os!`;
        $('#newsOrderDone').hidden = false;
        return;
      }
      if (res.error === 'net') return fail('Kunne ikke sende lige nu – prøv igen, eller ring til os.');
      if (res.reason === 'deadline') return fail('Bestillingsfristen for denne special er desværre udløbet.');
      if (res.reason === 'antal') return fail(res.remaining > 0 ? `Der er desværre kun ${res.remaining} tilbage – sæt antallet ned og prøv igen.` : 'Denne special er desværre udsolgt.');
      if (res.reason === 'dato') return fail('Vælg en gyldig dato (i dag eller senere).');
      if (['ikke-bestilbar', 'ikke-aktiv', 'findes-ikke'].includes(res.reason)) return fail('Denne special kan desværre ikke bestilles længere.');
      return fail('Noget gik galt – prøv igen, eller ring til os.');
    });
  }

  /* ---------- render alt (og gen-render hvis admin ændrer data) ---------- */
  function renderAll() {
    renderPause();
    renderClosure();
    renderNews();
    renderToday();
    renderWeekPlan();
    renderHours();
    renderOrderDates();
    renderContact();
    renderCloudNotice();
  }
  renderAll();

  /* Hver del tegnes for sig. Går én galt, må den ikke tage resten af
     siden med sig – før kunne en fejl i ugeoversigten betyde at både
     åbningstider, kontakt og datolisten holdt op med at opdatere,
     uden at nogen kunne se hvorfor. */
  function tegn(navn, fn) {
    try { fn(); } catch (e) { console.error(`Spiis: kunne ikke tegne "${navn}"`, e); }
  }
  S.subscribe(() => {
    tegn('pause', renderPause);
    tegn('ferie', renderClosure);
    tegn('nyheder', renderNews);
    tegn('dagens ret', renderToday);
    tegn('ugeoversigt', renderWeekPlan);
    tegn('åbningstider', renderHours);
    tegn('kontakt', renderContact);
    tegn('forbindelse', renderCloudNotice);
    tegn('datoliste', refreshOrderDatesPreserving);
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
