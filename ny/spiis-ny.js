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

  /* ---------- eksempel: "lad os lege det er mandag" (Mikkel 23/10) ----------
     /ny/ viser som standard en almindelig hverdag: vi lader som om det er førstkommende mandag
     og låner Spiis' egne retter fra ugen før (de ligger i databasen). ?rigtig viser ugen,
     som den står nu. Kun på udkastet – den rigtige forside kender ikke til det. */
  var EKSEMPEL = !/[?&]rigtig/.test(location.search);
  var mandag = function () { var d = S.todayISO(); while (S.weekdayIndex(d) !== 0) d = S.addDays(d, 1); return d; };
  var DAG = EKSEMPEL ? mandag() : S.todayISO();
  var paen = function (t) { t = String(t || '').trim().replace(/\.$/, ''); return t.charAt(0).toUpperCase() + t.slice(1); };
  function plan7() {
    var plan = S.getPlan(7, DAG);
    if (!EKSEMPEL) return plan;
    return plan.map(function (d, i) {
      var laan = S.getDagensRetList(S.addDays(d.iso, -7));
      if (!laan.length && i < 4) laan = [[{ title: 'Åben lasagne', desc: 'Med salciccia, frisk spinat, svampe og mascarponecreme.', price: 109, stock: 30 }],
        [{ title: 'Pork au vin', desc: 'Nakkefilet i rødvinssauce med grøntsager, urter og kartoffelmos.', price: 109, stock: 30 }],
        [{ title: 'Chili con carne', desc: 'Med creme fraiche og ris.', price: 109, stock: 30 }],
        [{ title: 'Cremet kyllingegryde', desc: 'Med æblecider, porrer, bacon og timianstegte kartofler.', price: 109, stock: 30 }]][i];
      d.dishes = lukketFor(d.iso) ? [] : (laan || []);
      d.ingenRet = !d.dishes.length; /* Spiis laver dagens ret mandag–torsdag; resten er caféens egne dage */
      return d;
    });
  }
  function tilbageFor(d, r, i) {
    if (EKSEMPEL) return r.stock ? (i === 0 ? Math.round(r.stock * 0.6) : r.stock) : null;
    try { return S.getRemainingFor ? S.getRemainingFor(d.iso, r.title) : S.getRemaining(d.iso); } catch (e) { return null; }
  }

  /* ---------- toppen: åbent nu og dagens ret ---------- */
  function top() {
    var iDag = DAG;
    var t = S.hoursFor(iDag) || {};
    var status = $('[data-status]');
    if (status && (t.open || t.closed)) {
      var nu = new Date(), m = EKSEMPEL ? 12 * 60 : nu.getHours() * 60 + nu.getMinutes();
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
    var ret = (plan7()[0].dishes || [])[0];
    var idag = $('[data-hero-idag]');
    if (idag) {
      idag.hidden = !ret || lukketFor(iDag);
      if (ret) { $('[data-hero-ret]', idag).textContent = paen(ret.title); $('[data-hero-pris]', idag).textContent = kr(ret.price); }
    }
  }

  /* ---------- dagens ret ----------
     I dag står alene øverst og stort: retten, prisen, portioner tilbage og hvornår den kan
     hentes. Resten af ugen ligger som små dagskort, man swiper igennem. Er der ingen ret hele
     ugen, skriver kridttavlen ugen op i stedet. */
  function dagKort(d, i) {
    var luk = lukketFor(d.iso);
    var retter = d.dishes || [];
    var navn = i === 1 ? 'I morgen' : d.weekday;
    var hoved = '<header class="dret-hoved"><b>' + esc(navn) + '</b><span>' + esc(i === 1 ? S.formatDate(d.iso) : S.formatDate(d.iso).replace(d.weekday + ' ', '')) + '</span>'
      + '<svg class="dret-hue" aria-hidden="true"><use href="#hue"/></svg></header>';
    if (luk || (d.ingenRet && !retter.length)) {
      /* caféen kan have åbent, selv om køkkenet ikke tager bestillinger – sig det, så ingen tror, der er lukket */
      var h = S.hoursFor ? S.hoursFor(d.iso) : null;
      var aaben = h && !h.closed && h.open;
      return '<article class="dret lukket">' + hoved + '<div class="dret-krop">'
        + (aaben ? '<h3>Kom forbi</h3><p>Åbent ' + esc(kl(h.open) + '–' + kl(h.close)) + '. Ingen dagens ret.</p>'
                 : '<h3>Lukket</h3><p>Caféen holder lukket.</p>')
        + '</div></article>';
    }
    if (!retter.length) return '<article class="dret tom">' + hoved + '<div class="dret-krop"><h3>Følger snart</h3><p>Retten skrives op i løbet af ugen.</p></div></article>';
    var r = retter[0];
    var eller = retter.slice(1).map(function (x) { return '<p class="eller">Eller: ' + esc(paen(x.title)) + '</p>'; }).join('');
    return '<article class="dret">' + hoved
      + '<div class="dret-krop"><h3>' + esc(paen(r.title)) + '</h3>' + (r.desc ? '<p>' + esc(r.desc) + '</p>' : '') + eller + '</div>'
      + '<footer class="dret-fod">' + (r.price ? '<span class="dret-pris">' + esc(kr(r.price)) + '</span>' : '')
      + '<a class="knap knap--lys" href="#bestil" data-bestil-dag="' + d.iso + '" aria-label="Forudbestil ' + esc(paen(r.title)) + ' ' + esc(navn.toLowerCase()) + '">Forudbestil</a>'
      + '</footer></article>';
  }
  function idagKort(d, plan) {
    var h = S.hoursFor(d.iso) || {};
    var retter = d.dishes || [];
    var baand = '<div class="idag-baand"><span class="idag-prik" aria-hidden="true"></span><b>I dag</b><span>' + esc(S.formatDate(d.iso)) + '</span></div>';
    if (lukketFor(d.iso) || !retter.length) {
      var naeste = plan.slice(1).filter(function (x) { return !lukketFor(x.iso) && (x.dishes || []).length; })[0];
      return '<article class="idag-kort fri">' + baand + '<div class="idag-krop"><span class="kicker">Dagens ret</span>'
        + '<h3>' + (lukketFor(d.iso) ? 'Køkkenet holder fri i dag' : 'Dagens ret skrives op senere') + '</h3>'
        + (naeste ? '<p class="idag-naeste">Næste ret: <b>' + esc(naeste.weekday) + ' · ' + esc(paen(naeste.dishes[0].title)) + '</b></p>' : '')
        + '</div></article>';
    }
    var r = retter[0];
    var n = tilbageFor(d, r, 0);
    var ude = typeof n === 'number' && n <= 0;
    var maaler = '';
    if (typeof n === 'number' && isFinite(n)) {
      var ialt = r.stock || n;
      maaler = '<div class="idag-portioner' + (ude ? ' ude' : '') + '"><div><b>' + (ude ? 'Udsolgt i dag' : n + ' portioner tilbage') + '</b>'
        + (ialt && !ude ? '<span>af ' + ialt + '</span>' : '') + '</div>'
        + '<i style="--fyld:' + (ialt ? Math.max(0, Math.min(1, n / ialt)) : 0) + '"></i></div>';
    }
    var eller = retter.slice(1).map(function (x) { return '<p class="eller">Eller: <b>' + esc(paen(x.title)) + '</b>' + (x.price ? ' · ' + esc(kr(x.price)) : '') + '</p>'; }).join('');
    return '<article class="idag-kort">' + baand
      + '<svg class="idag-hue" aria-hidden="true"><use href="#hue"/></svg>'
      + '<div class="idag-krop"><span class="kicker">Dagens ret</span><h3>' + esc(paen(r.title)) + '</h3>'
      + (r.desc ? '<p class="idag-beskriv">' + esc(r.desc) + '</p>' : '') + eller
      + '<div class="idag-fakta"><span class="idag-pris">' + esc(kr(r.price)) + '</span>'
      + (h.open && h.close ? '<span class="idag-tid">Kan hentes<br><b>' + esc(kl(h.open) + '–' + kl(h.close)) + '</b></span>' : '') + '</div>'
      + maaler
      + (ude ? '' : '<a class="knap knap--orange idag-bestil" href="#bestil" data-bestil-dag="' + d.iso + '">Bestil dagens ret <i aria-hidden="true">→</i></a>')
      + '</div></article>';
  }
  function dagens() {
    var boks = $('[data-dage]');
    if (!boks) return;
    var plan = plan7();
    var ingen = !plan.some(function (d) { return !lukketFor(d.iso) && (d.dishes || []).length; });
    var stor = $('[data-dagens-idag]');
    if (stor) { stor.hidden = ingen; stor.innerHTML = ingen ? '' : idagKort(plan[0], plan); }
    var rest = plan.slice(1);
    boks.innerHTML = rest.map(function (d, i) { return dagKort(d, i + 1); }).join('');
    boks.hidden = ingen;
    var ugeTitel = $('[data-resten]');
    if (ugeTitel) ugeTitel.hidden = ingen;
    var skilt = $('[data-eksempel]');
    if (skilt) {
      skilt.hidden = false;
      skilt.innerHTML = EKSEMPEL
        ? '<b>Eksempel</b> Sådan ser en mandag ud – med Spiis\' egne retter fra sidste uge. <a href="?rigtig#dagens">Se ugen, som den står nu →</a>'
        : '<b>Rigtige data</b> Ugen, som den står i databasen lige nu. <a href="./#dagens">Se eksemplet →</a>';
    }
    /* ingen ret hele ugen: tavlen siger det og skriver ugen op i kridt */
    var tom = $('[data-dage-tom]');
    if (tom) {
      tom.hidden = !ingen;
      var liste = $('[data-tavle-dage]');
      if (liste && ingen) liste.innerHTML = plan.map(function (d, i) {
        var h = S.hoursFor ? S.hoursFor(d.iso) : null;
        var aaben = h && !h.closed && h.open;
        var tekst = !aaben ? 'Lukket' : lukketFor(d.iso) ? 'Kom forbi ' + kl(h.open) + '–' + kl(h.close) : 'Følger snart';
        return '<li style="--n:' + i + '" class="' + (i === 0 ? 'idag ' : '') + (aaben ? 'aaben' : '') + '"><b>' + esc(d.weekday) + '</b><span>' + esc(tekst) + '</span></li>';
      }).join('');
      if (ingen && !tom.dataset.set) {
        tom.dataset.set = '1';
        if ('IntersectionObserver' in window) {
          var io = new IntersectionObserver(function (e) { if (e[0].isIntersecting) { tom.classList.add('vis'); io.disconnect(); } }, { threshold: .35 });
          io.observe(tom);
        } else tom.classList.add('vis');
      }
    }
    var prik = $('[data-dage-prik]');
    if (prik) { prik.hidden = ingen; prik.innerHTML = rest.map(function (d, i) { return '<i' + (i === 0 ? ' class="on"' : '') + '></i>'; }).join(''); }
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
