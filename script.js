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
// Reads the Payment Link from the button's data-payment-link attribute.
// To activate: replace REPLACE_WITH_STRIPE_PAYMENT_LINK in index.html
// with your Stripe Payment Link (e.g. https://buy.stripe.com/xxxx).
const checkoutBtn = document.getElementById('checkout-btn');
if (checkoutBtn) {
  const link = checkoutBtn.getAttribute('data-payment-link');
  const isConfigured = link && link !== 'REPLACE_WITH_STRIPE_PAYMENT_LINK';

  if (isConfigured) {
    checkoutBtn.setAttribute('href', link);
  } else {
    checkoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      alert(
        'Betaling er ikke konfigurert ennå.\n\n' +
        'Lim inn din Stripe Payment Link i index.html ' +
        '(attributtet data-payment-link på "Sikre din plass"-knappen).'
      );
    });
  }
}

// --- Reveal-on-scroll animation ---
const revealEls = document.querySelectorAll('.card, .step, .stat, .price-card, .guarantee, .section-head');
if ('IntersectionObserver' in window) {
  revealEls.forEach((el) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(18px)';
    el.style.transition = 'opacity .6s ease, transform .6s ease';
  });
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  revealEls.forEach((el) => io.observe(el));
}
