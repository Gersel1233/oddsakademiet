/* Spiis /ny/: small things for the café.
   - the week of dishes scrolls sideways; on a computer two round arrows
     move it a card at a time
*/
(() => {
  const $ = (s, r = document) => r.querySelector(s);

  // ---------- the week, sideways ----------
  const grid = $('#weekPlan'), title = $('.weekplan__title');
  if (grid && title && !$('.weekplan__head')) {
    const head = document.createElement('div'); head.className = 'weekplan__head';
    title.before(head); head.append(title);
    const arrow = (d) => `<svg viewBox="0 0 16 16"><path d="${d}"/></svg>`;
    const nav = document.createElement('div'); nav.className = 'ny-wk-nav';
    nav.innerHTML = `<button type="button" aria-label="Forrige dage">${arrow('M10 3.5 5.5 8 10 12.5')}</button><button type="button" aria-label="Næste dage">${arrow('M6 3.5 10.5 8 6 12.5')}</button>`;
    head.append(nav);
    const [prev, next] = nav.querySelectorAll('button');
    const step = () => { const c = grid.querySelector('.dayplan'); return c ? c.getBoundingClientRect().width + 12 : 260; };
    prev.addEventListener('click', () => grid.scrollBy({ left: -step() * 2, behavior: 'smooth' }));
    next.addEventListener('click', () => grid.scrollBy({ left: step() * 2, behavior: 'smooth' }));
    const ends = () => { prev.disabled = grid.scrollLeft < 4; next.disabled = grid.scrollLeft + grid.clientWidth > grid.scrollWidth - 4; };
    grid.addEventListener('scroll', ends, { passive: true }); addEventListener('resize', ends);
    new MutationObserver(ends).observe(grid, { childList: true }); ends();
  }

})();
