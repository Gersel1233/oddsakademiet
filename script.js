/* ===========================================================
   Oddsakademiet — frontend interactions
   =========================================================== */

// --- Current year in footer ---
document.getElementById('year').textContent = new Date().getFullYear();

// --- Mobile nav toggle ---
const toggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.nav');
if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  nav.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    })
  );
}

// --- Stripe checkout button ---
// Reads the Payment Link from data-payment-link. To change the product/price,
// update the link in index.html (product prod_R1Hzl2ffai5vaI).
const checkoutBtn = document.getElementById('checkout-btn');
if (checkoutBtn) {
  const link = checkoutBtn.getAttribute('data-payment-link');
  const isConfigured = link && link !== 'REPLACE_WITH_STRIPE_PAYMENT_LINK';
  if (isConfigured) {
    checkoutBtn.setAttribute('href', link);
  } else {
    checkoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      alert('Betaling er ikke konfigureret endnu. Indsæt din Stripe Payment Link i index.html.');
    });
  }
}

// --- Reveal-on-scroll (staggered) ---
const revealEls = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          const el = entry.target;
          // small stagger for groups of siblings
          const delay = Math.min(i * 60, 240);
          el.style.transitionDelay = delay + 'ms';
          el.classList.add('in');
          io.unobserve(el);
        }
      });
    },
    { threshold: 0.12 }
  );
  revealEls.forEach((el) => io.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add('in'));
}
