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

  /* ---------- dagens ret: ugens dagskort ----------
     I dag først. En åben dag med ret får navn, beskrivelse, pris, portioner tilbage og sin
     egen Bestil; en åben dag uden ret siger "Følger snart"; en lukket dag står smal. */
  function dagens() {
    var boks = $('[data-dage]');
    if (!boks) return;
    var plan = S.getPlan(7, S.todayISO());
    var html = plan.map(function (d, i) {
      var luk = lukketFor(d.iso);
      var retter = d.dishes || [];
      var navn = i === 0 ? 'I dag' : i === 1 ? 'I morgen' : d.weekday;
      var hoved = '<header class="dret-hoved"><b>' + esc(navn) + '</b><span>' + esc(i < 2 ? S.formatDate(d.iso) : S.formatDate(d.iso).replace(d.weekday + ' ', '')) + '</span>'
        + '<svg class="dret-hue" aria-hidden="true"><use href="#hue"/></svg></header>';
      if (luk) {
        /* caféen kan have åbent, selv om køkkenet ikke tager bestillinger – sig det, så ingen tror, der er lukket */
        var h = S.hoursFor ? S.hoursFor(d.iso) : null;
        var aaben = h && !h.closed && h.open;
        return '<article class="dret lukket">' + hoved + '<div class="dret-krop">'
          + (aaben ? '<h3>Kom forbi</h3><p>Åbent ' + esc(kl(h.open) + '–' + kl(h.close)) + '. Ingen bestilling af dagens ret denne dag.</p>'
                   : '<h3>Lukket</h3><p>Caféen holder lukket.</p>')
          + '</div></article>';
      }
      if (!retter.length) return '<article class="dret tom' + (i === 0 ? ' idag' : '') + '">' + hoved + '<div class="dret-krop"><h3>Følger snart</h3><p>Retten lægges op i løbet af ugen.</p></div></article>';
      var r = retter[0];
      var n = null;
      try { n = S.getRemainingFor ? S.getRemainingFor(d.iso, r.title) : S.getRemaining(d.iso); } catch (e) { n = null; }
      var tilbage = (typeof n === 'number' && isFinite(n))
        ? (n > 0 ? '<span class="dret-tilbage">● ' + n + ' tilbage</span>' : '<span class="dret-tilbage ude">Udsolgt</span>') : '';
      var eller = retter.slice(1).map(function (x) { return '<p class="eller">Eller: ' + esc(x.title) + (x.price ? ' · ' + esc(kr(x.price)) : '') + '</p>'; }).join('');
      var kanBestilles = !(typeof n === 'number' && n <= 0);
      return '<article class="dret' + (i === 0 ? ' idag' : '') + '">' + hoved
        + '<div class="dret-krop"><h3>' + esc(r.title) + '</h3>' + (r.desc ? '<p>' + esc(r.desc) + '</p>' : '') + eller + '</div>'
        + '<footer class="dret-fod">' + (r.price ? '<span class="dret-pris">' + esc(kr(r.price)) + '</span>' : '') + tilbage
        + (kanBestilles ? '<a class="knap knap--orange" href="#bestil" data-bestil-dag="' + d.iso + '" aria-label="Bestil ' + esc(r.title) + ' ' + esc(navn.toLowerCase()) + '">Bestil</a>' : '')
        + '</footer></article>';
    }).join('');
    boks.innerHTML = html;
    /* ingen ret hele ugen: tom-kortet siger det, og ugen står som en lille stribe */
    var ingen = !plan.some(function (d) { return !lukketFor(d.iso) && (d.dishes || []).length; });
    boks.classList.toggle('mini', ingen);
    var tom = $('[data-dage-tom]');
    if (tom) tom.hidden = !ingen;
    var prik = $('[data-dage-prik]');
    if (prik) prik.innerHTML = plan.map(function (d, i) { return '<i' + (i === 0 ? ' class="on"' : '') + '></i>'; }).join('');
  }
  /* prikkerne følger swipet */
  document.addEventListener('scroll', function (e) {
    var boks = e.target;
    if (!boks || !boks.matches || !boks.matches('[data-dage]')) return;
    var kort = boks.children, prik = document.querySelectorAll('[data-dage-prik] i');
    if (!kort.length || !prik.length) return;
    var x = boks.scrollLeft + 24, nr = 0;
    for (var i = 0; i < kort.length; i++) if (kort[i].offsetLeft - boks.offsetLeft <= x + 40) nr = i;
    if (boks.scrollLeft + boks.clientWidth >= boks.scrollWidth - 4) nr = kort.length - 1;
    prik.forEach(function (p, j) { p.classList.toggle('on', j === nr); });
  }, true);

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
