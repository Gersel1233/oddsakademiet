/* Spiis /ny/: what the kitchen has chosen in the admin under "Det viser
   hjemmesiden". Tapas can be open for orders (as always), on a pause
   (shown, but the order form gives way to a short note), or hidden
   (the section and every link to it are gone). Follows changes live. */
(() => {
  const S = (typeof SpiisStore !== 'undefined') ? SpiisStore : null;
  if (!S) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let last = '';
  function apply() {
    const st = S.getSettings(), mode = ['pause', 'off'].includes(st.tapasMode) ? st.tapasMode : 'on';
    const msg = (st.tapasPauseMsg || '').trim(), phone = st.phone || '93 99 58 58';
    const key = mode + '|' + msg + '|' + phone; if (key === last) return; last = key;
    const sec = document.getElementById('tapas'), form = document.getElementById('tapasForm');
    if (sec) sec.hidden = mode === 'off';
    document.querySelectorAll('a[href$="#tapas"]').forEach((a) => { a.hidden = mode === 'off'; });
    if (!form) return;
    let note = document.getElementById('nyTapasPause');
    if (mode === 'pause') {
      form.hidden = true;
      if (!note) { note = document.createElement('div'); note.id = 'nyTapasPause'; note.className = 'card ny-tapas-pause'; form.after(note); }
      note.innerHTML = `<span class="ny-tapas-pause__dot" aria-hidden="true"></span>
        <h3>Tapas holder pause</h3>
        <p>${msg ? esc(msg) : 'Vi tager ikke imod tapasbestillinger lige nu. Kig forbi igen snart.'}</p>
        <a class="btn btn--ghost-dark" href="tel:+45${esc(phone.replace(/\D/g, ''))}">Ring til os på ${esc(phone)}</a>`;
    } else {
      form.hidden = false;
      if (note) note.remove();
    }
  }
  apply();
  if (S.subscribe) S.subscribe(apply);
})();
