/* Spiis /ny/menu: a bar of the categories that stays at the top while you
   scroll; a tap jumps to the category, and the one you are in lights up. */
(() => {
  const bar = document.getElementById('nmBar'), wrap = document.getElementById('menuCategories');
  if (!bar || !wrap) return;
  let io = null;
  function build() {
    const cats = Array.from(wrap.querySelectorAll('.menucat'));
    bar.innerHTML = cats.map((c, i) => {
      c.id = c.id || `kat-${i}`;
      const h = c.querySelector('h4');
      const name = h ? Array.from(h.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim() : `Kategori ${i + 1}`;
      const ic = h && h.querySelector('.menucat__icon') ? h.querySelector('.menucat__icon').textContent : '';
      return `<a href="#${c.id}" data-i="${i}"><span aria-hidden="true">${ic}</span>${name}</a>`;
    }).join('');
    if (io) io.disconnect();
    io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      bar.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === `#${e.target.id}`));
      const on = bar.querySelector('a.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }), { rootMargin: '-45% 0px -50% 0px' });
    cats.forEach((c) => io.observe(c));
  }
  new MutationObserver(build).observe(wrap, { childList: true });
  build();
})();

/* the week on the menu page: the words without the small emoji in front
   (🚫 Lukket, 🗓️ Menuen …), so every row reads the same */
(() => {
  const el = document.getElementById('ugeMenu');
  if (!el) return;
  const clean = () => el.querySelectorAll('.ugerow__lukket, .ugerow__tom').forEach((s) => {
    const t = s.textContent.replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '');
    if (t !== s.textContent) s.textContent = t;
  });
  new MutationObserver(clean).observe(el, { childList: true, subtree: true }); clean();
})();
