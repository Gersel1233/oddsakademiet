/* Spiis /ny/ — udkastets felter tegnes af Spiis' egen database (23/10).
   Mikkel: "brug gerne rigtige priser osv i /ny". Samme datalag som den rigtige forside
   (js/store.js → SpiisStore): dagens ret med pris og portioner tilbage, ugen, menukortet,
   nyhederne og åbningstiderne. Intet tal står i HTML'en; står der intet i databasen, står
   feltet ikke. SpiisStore.subscribe kalder igen, når databasen har svaret. */
(function () {
  'use strict';
  if (typeof SpiisStore === 'undefined') return;
  var S = SpiisStore;
  var $ = function (q, rod) { return (rod || document).querySelector(q); };
  var kr = function (n) { return n === null || n === undefined || n === '' ? '' : n + ' kr.'; };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var kl = function (t) { return String(t || '').replace(/^0/, '').replace(':00', '').replace(':', '.'); };
  var lukketFor = function (iso) { try { return !S.isOpenDay(iso) || (S.isOrderingClosed && S.isOrderingClosed(iso)); } catch (e) { return false; } };

  /* ---------- toppen: åbent nu og dagens ret ---------- */
  function top() {
    var iDag = S.todayISO();
    var t = S.hoursFor(iDag) || {};
    var status = $('[data-status]');
    if (status && (t.open || t.closed)) {
      var nu = new Date(), m = nu.getHours() * 60 + nu.getMinutes();
      var tilMin = function (x) { var p = String(x).split(':'); return (+p[0]) * 60 + (+p[1] || 0); };
      var tekst, aaben = false;
      if (t.closed) tekst = 'Lukket i dag';
      else if (m < tilMin(t.open)) tekst = 'Åbner i dag kl. ' + kl(t.open);
      else if (m < tilMin(t.close)) { tekst = 'Åbent nu · til ' + kl(t.close); aaben = true; }
      else tekst = 'Lukket for i dag';
      $('[data-status-tekst]', status).textContent = tekst;
      status.classList.toggle('lukket', !aaben);
      status.hidden = false;
    }
    var ret = S.getDagensRet(iDag);
    var idag = $('[data-hero-idag]');
    if (idag) {
      idag.hidden = !ret || lukketFor(iDag);
      if (ret) { $('[data-hero-ret]', idag).textContent = ret.title; $('[data-hero-pris]', idag).textContent = kr(ret.price); }
    }
  }

  /* ---------- dagens ret: sedlen og ugen ---------- */
  function dagens() {
    var iDag = S.todayISO();
    var seddel = $('[data-idag]');
    if (seddel) {
      var retter = S.getDagensRetList(iDag);
      var lukket = lukketFor(iDag);
      $('[data-idag-dato]', seddel).textContent = 'I dag · ' + S.WEEKDAYS[S.weekdayIndex(iDag)].toLowerCase() + ' ' + S.formatDate(iDag);
      var fod = $('[data-idag-fod]', seddel);
      if (lukket) {
        $('[data-idag-ret]', seddel).textContent = 'Lukket i dag';
        $('[data-idag-tekst]', seddel).textContent = 'Se ugens retter herunder – eller ring og hør på 93 99 58 58.';
        $('[data-idag-haand]', seddel).hidden = true;
        fod.hidden = true;
      } else if (!retter.length) {
        $('[data-idag-ret]', seddel).textContent = 'Vi opdaterer menuen lige nu';
        $('[data-idag-tekst]', seddel).textContent = 'Kig forbi snart – eller ring til os og hør, hvad der er på menuen.';
        $('[data-idag-haand]', seddel).hidden = true;
        fod.hidden = true;
      } else {
        var r = retter[0];
        $('[data-idag-ret]', seddel).textContent = r.title;
        var linjer = [];
        if (r.desc) linjer.push(r.desc);
        retter.slice(1).forEach(function (x) { linjer.push('Eller: ' + x.title + (x.price ? ' · ' + kr(x.price) : '')); });
        $('[data-idag-tekst]', seddel).textContent = linjer.join(' ');
        $('[data-idag-haand]', seddel).hidden = false;
        $('[data-idag-pris]', seddel).textContent = kr(r.price);
        var tilbage = $('[data-idag-tilbage]', seddel);
        var n = null;
        try { n = S.getRemainingFor ? S.getRemainingFor(iDag, r.title) : S.getRemaining(iDag); } catch (e) { n = null; }
        if (typeof n === 'number' && isFinite(n)) {
          tilbage.textContent = n > 0 ? '● ' + n + ' portioner tilbage' : 'Udsolgt i dag';
          tilbage.hidden = false;
        } else tilbage.hidden = true;
        fod.hidden = false;
      }
    }
    var uge = $('[data-uge]');
    if (uge) {
      uge.innerHTML = S.getPlan(7, S.addDays(S.todayISO(), 1)).map(function (d) {
        var luk = lukketFor(d.iso);
        var retter = d.dishes || [];
        var navn = luk ? 'Lukket' : retter.length ? retter.map(function (x) { return x.title; }).join(' · ') : 'Følger snart';
        var pris = !luk && retter.length === 1 && retter[0].price ? kr(retter[0].price) : (luk ? 'Lukket for bestillinger' : '');
        return '<div class="dag' + (luk ? ' lukket' : '') + '"><small>' + esc(d.weekday) + ' · ' + esc(S.formatDate(d.iso)) + '</small><b>' + esc(navn) + '</b>' + (pris ? '<span>' + esc(pris) + '</span>' : '') + '</div>';
      }).join('');
    }
  }

  /* ---------- menukortet: faner og retter med priser ---------- */
  var valgtKat = 0;
  function menu() {
    var faner = $('[data-faner]'), kort = $('[data-kort]');
    if (!faner || !kort) return;
    var m = S.getMenu() || {};
    var kats = (m.categories || []).filter(function (k) { return k && (k.items || []).length; });
    if (!kats.length) { kort.innerHTML = '<p class="note-eks">Menukortet er på vej.</p>'; faner.innerHTML = ''; return; }
    if (valgtKat >= kats.length) valgtKat = 0;
    faner.innerHTML = kats.map(function (k, i) {
      return '<button type="button" role="tab" aria-selected="' + (i === valgtKat) + '" class="' + (i === valgtKat ? 'on' : '') + '" data-kat="' + i + '">' + esc(k.name) + '</button>';
    }).join('');
    var k = kats[valgtKat];
    kort.innerHTML = (k.items || []).map(function (v) {
      var pris = v.price !== null && v.price !== undefined && v.price !== '' ? kr(v.price) : 'Spørg';
      return '<div class="ret"><div class="ret-top"><b>' + esc(v.name) + '</b><i></i><span>' + esc(pris) + '</span></div>' + (v.desc ? '<p>' + esc(v.desc) + '</p>' : '') + '</div>';
    }).join('');
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-faner] [data-kat]');
    if (!b) return;
    valgtKat = +b.getAttribute('data-kat');
    menu();
  });

  /* ---------- nyhederne: Spiis' egne opslag ---------- */
  function nyheder() {
    var raekke = $('[data-nyheder]'), afs = $('[data-nyheder-afsnit]');
    if (!raekke) return;
    var poster = (S.getNews() || []).filter(function (n) { return n.title && S.newsVisibleNow(n); }).slice(0, 6);
    if (afs) afs.hidden = !poster.length;
    raekke.innerHTML = poster.map(function (n) {
      var dato = n.createdAt ? S.formatDate(String(n.createdAt).slice(0, 10)) : '';
      var tekst = String(n.text || '');
      if (tekst.length > 110) tekst = tekst.slice(0, 108).replace(/\s+\S*$/, '') + ' …';
      return '<article class="opslag">' + (n.image ? '<img src="' + esc(n.image) + '" alt="" loading="lazy">' : '')
        + (dato ? '<small>' + esc(dato) + '</small>' : '') + '<h3>' + esc(n.title) + '</h3>'
        + (tekst ? '<p>' + esc(tekst) + '</p>' : '') + (n.price ? '<p><b>' + esc(n.price) + ' kr.</b></p>' : '') + '</article>';
    }).join('');
  }

  /* ---------- åbningstiderne ---------- */
  function tider() {
    var boks = $('[data-tider]');
    if (!boks) return;
    var t = S.getHours(), iDag = S.weekdayIndex(S.todayISO());
    var navne = S.WEEKDAYS;
    var sp = function (h) { return h.closed ? 'Lukket' : kl(h.open) + '–' + kl(h.close); };
    /* ens dage i træk står som én linje ("Mandag – onsdag") */
    var grupper = [];
    t.forEach(function (h, i) {
      var g = grupper[grupper.length - 1];
      if (g && g.tekst === sp(h) && i !== iDag && g.slut !== iDag) g.slut = i;
      else grupper.push({ start: i, slut: i, tekst: sp(h) });
    });
    boks.innerHTML = grupper.map(function (g) {
      var navn = g.start === g.slut ? navne[g.start] : navne[g.start] + ' – ' + navne[g.slut].toLowerCase();
      var idag = g.start === iDag && g.slut === iDag;
      return '<div class="tid' + (idag ? ' idag' : '') + '"><span>' + esc(navn) + (idag ? ' (i dag)' : '') + '</span><i></i><b>' + esc(g.tekst) + '</b></div>';
    }).join('');
  }

  function alt() {
    [top, dagens, menu, nyheder, tider].forEach(function (f) { try { f(); } catch (e) { console.error(e); } });
  }
  alt();
  if (S.subscribe) S.subscribe(alt);

  /* ---------- billedrækken glider roligt og kan swipes ---------- */
  (function () {
    var spor = document.querySelector('[data-raekke]');
    if (!spor || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    [].slice.call(spor.children).forEach(function (k) {
      var kopi = k.cloneNode(true); kopi.setAttribute('aria-hidden', 'true'); kopi.tabIndex = -1; spor.appendChild(kopi);
    });
    var hvil = 0, synlig = true, x = 0;
    var pause = function () { hvil = performance.now() + 2600; };
    ['pointerdown', 'touchstart', 'wheel', 'focusin'].forEach(function (h) { spor.addEventListener(h, pause, { passive: true }); });
    new IntersectionObserver(function (p) { synlig = p[0].isIntersecting; }).observe(spor);
    (function gaa(t) {
      if (synlig && t > hvil) {
        x = x || spor.scrollLeft;
        x += 0.35;
        var halv = spor.scrollWidth / 2;
        if (x >= halv) x -= halv;
        spor.scrollLeft = x;
      } else x = spor.scrollLeft;
      requestAnimationFrame(gaa);
    })(0);
  })();
})();

/* Bestil-pillen kommer først, når toppen med sine egne knapper er rullet forbi */
(function () {
  var pille = document.querySelector('[data-pille]'), top = document.getElementById('top');
  if (!pille || !top || !('IntersectionObserver' in window)) { if (pille) pille.classList.remove('skjult'); return; }
  new IntersectionObserver(function (p) { pille.classList.toggle('skjult', p[0].isIntersecting); }, { threshold: 0.15 }).observe(top);
})();
