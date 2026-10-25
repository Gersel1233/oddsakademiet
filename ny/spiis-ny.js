/* Spiis – det nye udtryk oven på Spiis' egne data (js/store.js → SpiisStore).
   Tegner toppens status, dagens ret i dag og kridttavlen med resten af ugen, menukortet og
   åbningstiderne. Selve bestillingen, nyhederne, tapas og vinduerne klarer js/main.js som
   altid – denne fil rører dem ikke, den vælger kun dagen i formularen, når man trykker Bestil.
   Står intet i databasen, står feltet ikke. SpiisStore.subscribe kalder igen ved ændringer. */
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

  var DAG = S.todayISO();
  var paen = function (t) { t = String(t || '').trim().replace(/\.$/, ''); return t.charAt(0).toUpperCase() + t.slice(1); };
  var plan7 = function () { return S.getPlan(7, DAG); };
  function tilbageFor(d, r, i) {
    try { return S.getRemainingFor ? S.getRemainingFor(d.iso, r.title) : S.getRemaining(d.iso); } catch (e) { return null; }
  }

  /* ---------- toppen: åbent nu og dagens ret ---------- */
  function top() {
    var iDag = DAG;
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
    var par = $('[data-dagens-par]');
    if (!par) return;
    var plan = plan7();
    var ingen = !plan.some(function (d) { return !lukketFor(d.iso) && (d.dishes || []).length; });
    par.classList.toggle('tom', ingen);
    var stor = $('[data-dagens-idag]');
    if (stor) { stor.hidden = ingen; stor.innerHTML = ingen ? '' : idagKort(plan[0], plan); }
    /* tavlen: resten af ugen i kridt. Har dagen en ret, står retten og prisen (og et tryk
       forudbestiller); ellers står hvad caféen gør den dag. Tom uge: tavlen tager hele ugen. */
    var tavle = $('[data-tavle]');
    if (!tavle) return;
    tavle.hidden = false;
    var dage = ingen ? plan : plan.slice(1);
    $('[data-tavle-kicker]', tavle).textContent = 'Ugens tavle';
    $('[data-tavle-titel]', tavle).textContent = ingen ? 'Ugens retter er på vej' : 'Resten af ugen';
    $('[data-tavle-tekst]', tavle).textContent = ingen
      ? 'Køkkenet skriver retterne op i løbet af ugen. Følg med i Facebook-gruppen – eller ring og hør, hvad der står på gryden.'
      : 'Tryk på en ret for at forudbestille den til dagen.';
    $('[data-tavle-knapper]', tavle).innerHTML = (ingen
      ? '<a class="knap knap--orange" href="#menukort">Se menukortet</a>'
      : '<a class="knap knap--orange" href="#bestil">Forudbestil en dag</a>')
      + '<a class="knap tavle-ring" href="tel:+4593995858">Ring 93 99 58 58</a>';
    $('[data-tavle-dage]', tavle).innerHTML = dage.map(function (d, i) {
      var nr = ingen ? i : i + 1;
      var navn = d.weekday + (nr === 0 ? ' · i dag' : nr === 1 ? ' · i morgen' : '');
      var dato = '<span class="dato">' + (+d.iso.slice(8, 10)) + '/' + (+d.iso.slice(5, 7)) + '</span>';
      var retter = d.dishes || [];
      if (!lukketFor(d.iso) && retter.length) {
        var r = retter[0];
        var flere = retter.length > 1 ? '<span class="forud">Eller: ' + esc(retter.slice(1).map(function (x) { return paen(x.title); }).join(', ')) + '</span>' : '';
        return '<li class="ret" style="--n:' + i + '"><a href="#bestil" data-bestil-dag="' + d.iso + '" aria-label="Forudbestil ' + esc(paen(r.title)) + ', ' + esc(navn) + '">'
          + '<small>' + esc(navn) + dato + '</small><em>' + esc(paen(r.title)) + '</em><span>' + esc(kr(r.price)) + '</span>' + flere + '</a></li>';
      }
      var h = S.hoursFor ? S.hoursFor(d.iso) : null;
      var aaben = h && !h.closed && h.open;
      var tekst = !aaben ? 'Lukket' : (lukketFor(d.iso) || d.ingenRet) ? 'Kom forbi ' + kl(h.open) + '–' + kl(h.close) : 'Følger snart';
      return '<li style="--n:' + i + '" class="' + (nr === 0 ? 'idag ' : nr === 1 ? 'imorgen ' : '') + (aaben ? 'aaben' : '') + '"><b>' + esc(d.weekday) + dato + '</b><span>' + esc(tekst) + '</span></li>';
    }).join('');
    if (!tavle.dataset.set) {
      tavle.dataset.set = '1';
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (e) { if (e[0].isIntersecting) { tavle.classList.add('vis'); io.disconnect(); } }, { threshold: .25 });
        io.observe(tavle);
      } else tavle.classList.add('vis');
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
    var t = S.getHours(), iDag = S.weekdayIndex(DAG);
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
    [top, dagens, menu, tider].forEach(function (f) { try { f(); } catch (e) { console.error(e); } });
  }
  alt();
  if (S.subscribe) S.subscribe(alt);

  /* "Bestil" på et dagskort eller en ret på tavlen: vælg dagen i den rigtige formular (samme vej som
     js/main.js' egen "Bestil til denne dag") og rul ned til den */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-bestil-dag]');
    if (!a) return;
    var iso = a.getAttribute('data-bestil-dag');
    var sel = document.getElementById('orderDate');
    if (sel && [].some.call(sel.options, function (o) { return o.value === iso && !o.disabled; })) {
      sel.value = iso;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  /* ---------- billedrækken glider roligt og kan swipes ----------
     Den glider med transform (GPU), ikke ved at skubbe scrollbaren: en telefon runder scrollLeft af
     til hele pixels, og 0,35 px pr. billede blev til små ryk. Rører man rækken, overtager den
     almindelige swipe – og 2½ sekund efter sidste berøring glider den videre derfra. */
  (function () {
    var spor = document.querySelector('[data-raekke]');
    if (!spor || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var kort = [].slice.call(spor.children);
    var baand = document.createElement('div');
    baand.className = 'raekke-baand';
    kort.forEach(function (k) { baand.appendChild(k); });
    kort.forEach(function (k) {
      var kopi = k.cloneNode(true); kopi.setAttribute('aria-hidden', 'true'); kopi.tabIndex = -1; baand.appendChild(kopi);
    });
    spor.appendChild(baand);
    var FART = 24; /* px pr. sekund */
    var off = 0, hvil = 0, synlig = true, sidst = 0, styrer = false;
    var periode = function () { return baand.children[kort.length].offsetLeft - baand.children[0].offsetLeft; };
    var tegn = function () { baand.style.transform = off ? 'translate3d(' + (-off).toFixed(2) + 'px,0,0)' : ''; };
    /* berøring: læg den glidende del over i scrollbaren, så swipe starter præcis hvor billedet står */
    var overtag = function () {
      hvil = performance.now() + 2600;
      if (!styrer && off) { var p = spor.scrollLeft + off; off = 0; tegn(); spor.scrollLeft = Math.round(p); }
      styrer = true;
    };
    ['pointerdown', 'touchstart', 'wheel', 'focusin'].forEach(function (h) { spor.addEventListener(h, overtag, { passive: true }); });
    spor.addEventListener('scroll', function () { if (styrer) hvil = performance.now() + 2600; }, { passive: true });
    new IntersectionObserver(function (p) { synlig = p[0].isIntersecting; }).observe(spor);
    (function gaa(t) {
      var dt = sidst ? Math.min(50, t - sidst) : 0;
      sidst = t;
      if (synlig && t > hvil) {
        styrer = false;
        off += FART * dt / 1000;
        var per = periode();
        if (per > 0 && spor.scrollLeft + off >= per) off -= per;
        tegn();
      }
      requestAnimationFrame(gaa);
    })(performance.now());
  })();
})();

/* Bestil-pillen kommer først, når toppen med sine egne knapper er rullet forbi */
(function () {
  var pille = document.querySelector('[data-pille]'), top = document.getElementById('top');
  if (!pille || !top || !('IntersectionObserver' in window)) { if (pille) pille.classList.remove('skjult'); return; }
  new IntersectionObserver(function (p) { pille.classList.toggle('skjult', p[0].isIntersecting); }, { threshold: 0.15 }).observe(top);
})();

/* ---------- påmindelse i kalenderen (Mikkel 24/10: "notifikation med bekræftelse og 30 min før") ----------
   Når tak-kortet kommer frem, får kunden en knap, der lægger bestillingen i telefonens kalender
   med en alarm 30 minutter før. Gratis, ingen konto, virker på iPhone og Android. Tiden læses
   af formularen, som js/main.js lader stå udfyldt bag tak-kortet – main.js røres ikke. */
(function () {
  var ADR = 'Spiis, Kongens Enge 42, 2690 Karlslunde';
  var to = function (n) { return (n < 10 ? '0' : '') + n; };
  var stempel = function (iso, hhmm, plusMin) {
    var d = new Date(iso + 'T' + hhmm + ':00');
    d.setMinutes(d.getMinutes() + (plusMin || 0));
    return d.getFullYear() + to(d.getMonth() + 1) + to(d.getDate()) + 'T' + to(d.getHours()) + to(d.getMinutes()) + '00';
  };
  var icsTekst = function (t) { return String(t).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1'); };
  function kalender(kort, iso, tid, titel, varighed) {
    var gl = kort.querySelector('.paamind');
    if (gl) gl.remove();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '') || !/^\d{1,2}:\d{2}$/.test(tid || '')) return;
    if (tid.length === 4) tid = '0' + tid;
    var tekst = (kort.querySelector('p') || {}).textContent || '';
    var tlf = (window.SpiisStore && SpiisStore.getSettings && SpiisStore.getSettings().phone) || '93 99 58 58';
    var detaljer = tekst + '\n\nKan du ikke komme? Ring til Spiis på ' + tlf + ' senest 1 time før.';
    var nu = new Date();
    var ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Spiis//Bestilling//DA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + Date.now().toString(36) + Math.random().toString(36).slice(2) + '@spiis.dk',
      'DTSTAMP:' + nu.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''),
      'DTSTART:' + stempel(iso, tid), 'DTEND:' + stempel(iso, tid, varighed),
      'SUMMARY:' + icsTekst(titel), 'LOCATION:' + icsTekst(ADR), 'DESCRIPTION:' + icsTekst(detaljer),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsTekst(titel + ' om 30 minutter'), 'TRIGGER:-PT30M', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n');
    var url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    var google = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(titel)
      + '&dates=' + stempel(iso, tid) + '/' + stempel(iso, tid, varighed) + '&ctz=Europe/Copenhagen'
      + '&location=' + encodeURIComponent(ADR) + '&details=' + encodeURIComponent(detaljer);
    var boks = document.createElement('div');
    boks.className = 'paamind';
    boks.innerHTML = '<p><b>Få en påmindelse 30 min før</b>Så ligger bestillingen i din kalender, og telefonen siger til i god tid.</p>'
      + '<a class="knap knap--orange" href="' + url + '" download="spiis-bestilling.ics" data-kalender>Sæt i kalenderen</a>'
      + '<a class="paamind-google" href="' + google + '" target="_blank" rel="noopener">Bruger du Google Kalender? Tilføj den her</a>';
    var foer = kort.querySelector('button, .tapas__ring');
    kort.insertBefore(boks, foer);
  }
  function vagt(id, laes) {
    var kort = document.getElementById(id);
    if (!kort) return;
    new MutationObserver(function () { if (!kort.hidden) { var v = laes(); kalender(kort, v[0], v[1], v[2], v[3]); } })
      .observe(kort, { attributes: true, attributeFilter: ['hidden'] });
  }
  var val = function (id) { var e = document.getElementById(id); return e ? e.value : ''; };
  vagt('orderSuccess', function () {
    var t = document.querySelector('input[name="orderType"]:checked');
    var spise = t && t.value === 'spise';
    return [val('orderDate'), val('orderTime'), spise ? 'Spisning hos Spiis' : 'Hent din mad hos Spiis', spise ? 90 : 15];
  });
  vagt('tapasSuccess', function () {
    var spise = val('tapasType') === 'spise';
    return [val('tapasDate'), val('tapasTime'), spise ? 'Tapas hos Spiis' : 'Hent jeres tapas hos Spiis', spise ? 120 : 15];
  });
})();

/* ---------- swipe for at bestille (Mikkel 24/10: "en slide-knap ligesom MobilePay") ----------
   I det sidste kig bekræfter man ved at trække knappen helt over. Det er js/main.js' egen
   "Bekræft & send", der trykkes på til sidst – vi bygger kun glideren ovenpå den.
   Tastatur: fokus på knappen og Enter/mellemrum bekræfter også. */
(function () {
  var vindue = document.getElementById('orderConfirmWrap');
  var send = document.getElementById('confirmSend');
  if (!vindue || !send) return;
  var svip = document.createElement('div');
  svip.className = 'svip';
  svip.innerHTML = '<span class="svip-fyld" aria-hidden="true"></span>'
    + '<span class="svip-tekst">Swipe for at bestille</span>'
    + '<button type="button" class="svip-knop" aria-label="Bekræft og send bestillingen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5"/></svg></button>';
  send.parentNode.insertBefore(svip, send);
  send.classList.add('svip-gemt');
  var knop = svip.querySelector('.svip-knop'), fyld = svip.querySelector('.svip-fyld'), tekst = svip.querySelector('.svip-tekst');
  var x = 0, start = 0, max = 0, traek = false, faerdig = false;
  var saet = function (v, glid) {
    x = Math.max(0, Math.min(max, v));
    knop.style.transition = fyld.style.transition = glid ? 'transform .35s cubic-bezier(.2,.9,.24,1), width .35s cubic-bezier(.2,.9,.24,1)' : 'none';
    knop.style.transform = 'translateX(' + x + 'px)';
    fyld.style.width = (x + knop.offsetWidth) + 'px';
    tekst.style.opacity = String(Math.max(0, 1 - x / (max * .6 || 1)));
  };
  function nulstil() {
    faerdig = false; svip.classList.remove('er-sendt');
    tekst.textContent = 'Swipe for at bestille';
    max = svip.clientWidth - knop.offsetWidth - 12;
    saet(0, false);
  }
  function bekraeft() {
    if (faerdig) return;
    faerdig = true;
    saet(max, true);
    svip.classList.add('er-sendt');
    tekst.textContent = 'Sender …'; tekst.style.opacity = '1';
    if (navigator.vibrate) { try { navigator.vibrate(18); } catch (e) {} }
    setTimeout(function () { send.click(); }, 280);
  }
  knop.addEventListener('pointerdown', function (e) {
    if (faerdig) return;
    traek = true; start = e.clientX - x; max = svip.clientWidth - knop.offsetWidth - 12;
    knop.setPointerCapture(e.pointerId);
  });
  knop.addEventListener('pointermove', function (e) { if (traek) saet(e.clientX - start, false); });
  var slip = function () {
    if (!traek) return;
    traek = false;
    if (x >= max * .82) bekraeft(); else saet(0, true);
  };
  knop.addEventListener('pointerup', slip);
  knop.addEventListener('pointercancel', slip);
  knop.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bekraeft(); }
  });
  /* nulstil, hver gang vinduet åbnes */
  new MutationObserver(function () { if (!vindue.hidden) requestAnimationFrame(nulstil); })
    .observe(vindue, { attributes: true, attributeFilter: ['hidden'] });
  window.addEventListener('resize', function () { if (!vindue.hidden && !faerdig) nulstil(); });
})();

/* ---------- stemplet: teksten skal gå præcis én gang rundt ----------
   Skriften er lidt forskellig fra telefon til telefon, så en fast afstand mellem bogstaverne
   kunne få teksten til at løbe ind i sig selv ("…CATERISPIIS"). Her måles teksten, og
   afstanden sættes, så den fylder cirklen helt – med lige stor luft ved hvert "·". */
(function () {
  function tilpas() {
    [].forEach.call(document.querySelectorAll('text[data-rundt]'), function (t) {
      var tp = t.querySelector('textPath');
      var sti = tp && document.querySelector(tp.getAttribute('href'));
      if (!sti || !sti.getTotalLength) return;
      try {
        t.setAttribute('letter-spacing', '0');
        var rest = sti.getTotalLength() - t.getComputedTextLength();
        var n = tp.textContent.length;
        t.setAttribute('letter-spacing', Math.max(0, rest / n).toFixed(2));
      } catch (e) { t.setAttribute('letter-spacing', '2.4'); }
    });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(tilpas);
  else window.addEventListener('load', tilpas);
})();

/* ---------- menuen: status øverst, luk med Escape eller ved tryk udenfor, ingen scroll bagved ---------- */
(function () {
  var ark = document.getElementById('navLinks'), knap = document.getElementById('navBurger');
  if (!ark || !knap) return;
  var aaben = function () { return ark.classList.contains('is-open'); };
  new MutationObserver(function () {
    var a = aaben();
    if (matchMedia('(max-width: 899px)').matches) document.documentElement.style.overflow = a ? 'hidden' : '';
    if (!a) return;
    knap.setAttribute('aria-label', 'Luk menu');
    var hero = document.querySelector('[data-status]'), m = ark.querySelector('[data-menu-status]');
    if (hero && m && !hero.hidden) {
      m.hidden = false;
      m.classList.toggle('lukket', hero.classList.contains('lukket'));
      m.querySelector('[data-menu-status-tekst]').textContent = (hero.querySelector('[data-status-tekst]') || {}).textContent || '';
    }
  }).observe(ark, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(function () { if (!aaben()) knap.setAttribute('aria-label', 'Åbn menu'); })
    .observe(knap, { attributes: true, attributeFilter: ['aria-expanded'] });
  ark.addEventListener('click', function (e) { if (e.target === ark && aaben()) knap.click(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && aaben()) { knap.click(); knap.focus(); } });
})();

/* ---------- bjælkerne i Safari følger det afsnit, man er i ----------
   Telefonens bjælker (øverst, og nederst på nyere iPhones) farves med sidens theme-color. Den sættes
   nu løbende til farven på det afsnit, der står øverst på skærmen – mørk over toppen og bunden,
   bordeaux over tapas, creme over de lyse afsnit – så der aldrig står en lys bjælke over en mørk
   flade. Logoet skifter samtidig mellem lyst og mørkt, så det altid kan læses. */
(function () {
  var meta = document.querySelector('meta[data-temafarve]');
  var bjaelke = document.querySelector('.top');
  if (!meta) return;
  var afsnit = [].filter.call(document.body.children, function (e) {
    return e.offsetHeight > 0 && getComputedStyle(e).position !== 'fixed' && !e.hidden;
  });
  var bodyFarve = getComputedStyle(document.body).backgroundColor;
  var farveVed = function (y) {
    for (var i = 0; i < afsnit.length; i++) {
      var r = afsnit[i].getBoundingClientRect();
      if (y < r.top || y >= r.bottom) continue;
      var c = getComputedStyle(afsnit[i]);
      /* billedrækken: mørk stribe øverst, derefter creme */
      if (c.backgroundImage.indexOf('gradient') > -1) return (y - r.top) < 70 ? '#24170F' : bodyFarve;
      return c.backgroundColor === 'rgba(0, 0, 0, 0)' || c.backgroundColor === 'transparent' ? bodyFarve : c.backgroundColor;
    }
    return bodyFarve;
  };
  var morkt = function (farve) {
    var m = String(farve).match(/\d+(\.\d+)?/g);
    if (!m) return /^#2|^#1|^#6B/i.test(farve);
    return (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) < 140;
  };
  var sidst = '', venter = false;
  var opdater = function () {
    venter = false;
    var f = farveVed(2);
    if (f === sidst) return;
    sidst = f;
    meta.setAttribute('content', f);
    if (bjaelke) bjaelke.classList.toggle('over-lys', !morkt(f));
  };
  var planlaeg = function () { if (!venter) { venter = true; requestAnimationFrame(opdater); } };
  addEventListener('scroll', planlaeg, { passive: true });
  addEventListener('resize', planlaeg);
  opdater();
  setTimeout(opdater, 1500); /* når databasen har fyldt afsnittene, flytter de sig */
})();

