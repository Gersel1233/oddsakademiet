# Oddsakademiet

Landing page for **Oddsakademiet** — access to a private sports-betting server where
crowd-driven data is combined with AI for more precise and profitable results.

Theme: **blue · black · white**. Built as a fast, dependency-free static site
(HTML + CSS + vanilla JS), hosted on **GitHub Pages**.

## Files

| File | Purpose |
|------|---------|
| `index.html` | The full landing page (hero, features, how-it-works, results, pricing, FAQ, footer) |
| `styles.css` | All styling and responsive layout |
| `script.js` | Mobile nav, scroll reveals, and the Stripe checkout wiring |
| `.github/workflows/deploy.yml` | Auto-deploys the site to GitHub Pages on push |

## 🔑 Connect your Stripe Payment Link

The "Sikre din plass" button is wired to a Stripe **Payment Link** for your product
(`prod_R1Hzl2ffai5vaI`).

1. In the [Stripe Dashboard](https://dashboard.stripe.com/payment-links), create a
   Payment Link for the product `prod_R1Hzl2ffai5vaI`. You'll get a URL like
   `https://buy.stripe.com/xxxxxxxxxxxx`.
2. In `index.html`, find the checkout button and replace the placeholder:
   ```html
   data-payment-link="REPLACE_WITH_STRIPE_PAYMENT_LINK"
   ```
   with your real link:
   ```html
   data-payment-link="https://buy.stripe.com/xxxxxxxxxxxx"
   ```
3. Commit & push. The button is now live. Until you do this, clicking it shows a
   reminder instead of charging anyone.

> Optionally update the displayed price in `index.html` (`id="price-amount"`) to match
> the price set on your Payment Link.

## 🚀 Go live on GitHub Pages

The workflow in `.github/workflows/deploy.yml` deploys automatically. One-time setup:

1. Go to your repo on GitHub → **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Push to the `claude/zen-davinci-m2j0ah` (or `main`) branch — the site deploys
   automatically.
4. Your live URL appears under **Settings → Pages** and in the workflow run
   (typically `https://<username>.github.io/oddsakademiet/`).

## Local preview

Just open `index.html` in a browser, or run a tiny server:

```bash
python3 -m http.server 8000
# visit http://localhost:8000
```

## Responsible gaming

This product involves sports betting. The site includes 18+ and responsible-gaming
messaging. No outcome is guaranteed — content is analysis and signals only.
