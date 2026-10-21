/* Spiis /ny/: the menu on the front page, read straight from Spiis' own
   menu (the one the kitchen edits). A tab for each category, the dishes
   with their prices, and the way to the whole menu. Read only. */
(() => {
  const S = (typeof SpiisStore !== 'undefined') ? SpiisStore : null; const box = document.getElementById('nyMenu');
  if (!S || !box) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const first = (d) => String(d || '').split('\n').map((l) => l.replace(/^[-•·*]\s*/, '').trim()).filter(Boolean).join(' · ');
  const icon = (c) => { const k = `${c.id || ''} ${c.name || ''}`.toLowerCase();
    return /burger/.test(k) ? '🍔' : /salat/.test(k) ? '🥗' : /friture|pommes|frit/.test(k) ? '🍟' : /drik/.test(k) ? '🥤' : /nacho|bowl/.test(k) ? '🌮' : /panini|sandwich|brød/.test(k) ? '🥖' : /tilbeh/.test(k) ? '🥣' : '🍽️'; };
  let cur = 0;

  function render() {
    const cats = (S.getMenu().categories || []).filter((c) => (c.items || []).length);
    if (!cats.length) { box.hidden = true; return; }
    box.hidden = false; if (cur >= cats.length) cur = 0;
    const c = cats[cur];
    box.querySelector('.nm-tabs').innerHTML = cats.map((x, i) =>
      `<button type="button" role="tab" class="nm-tab" aria-selected="${i === cur}" data-i="${i}"><span aria-hidden="true">${icon(x)}</span>${esc(x.name)}<small>${x.items.length}</small></button>`).join('');
    box.querySelector('.nm-list').innerHTML =
      (c.availability === 'hverdage' ? '<p class="nm-note">Kun på hverdage</p>' : '') +
      c.items.map((it) => `<${it.soldout ? 'div' : 'a href="#bestil"'} class="nm-item${it.soldout ? ' is-out' : ''}" data-ret="${esc(it.name)}" data-kat="${esc(c.name)}"${it.soldout ? '' : ` aria-label="Bestil ${esc(it.name)}"`}>
        <div class="nm-t"><b>${esc(it.name)}</b>${it.soldout ? '<span class="nm-badge out">Udsolgt i dag</span>' : (it.left ? `<span class="nm-badge few">Kun ${esc(it.left)} tilbage</span>` : '')}
          ${it.desc ? `<span class="nm-d">${esc(first(it.desc))}</span>` : ''}</div>
        <span class="nm-p">${it.price ? `${esc(it.price)} kr.` : ''}</span>${it.soldout ? '' : '<span class="nm-go" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3 8h9.4M9.1 4.4 12.6 8 9.1 11.6"/></svg></span>'}</${it.soldout ? 'div' : 'a'}>`).join('');
  }
  box.addEventListener('click', (e) => { const t = e.target.closest('.nm-tab'); if (!t) return; cur = +t.dataset.i; render(); });
  render();
  if (S.subscribe) S.subscribe(render);
})();
