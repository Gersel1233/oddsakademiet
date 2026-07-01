# Spiis – hjemmeside & admin-dashboard

Hjemmeside for **Spiis** – hjemmelavet mad, når hverdagen er travl 🧑‍🍳
Karlslunde Idrætsforening, Kongens Enge 42, 2690 Karlslunde.

Bygget som en hurtig, dependency-fri statisk side (HTML + CSS + vanilla JS),
der kan hostes på **GitHub Pages** – ingen build-step, ingen npm.

## Hvad kan siden?

### Hjemmesiden (`index.html`)
- 🎬 **Cinematic video-hero** med Spiis' egen video, scroll-animationer og motion graphics
- 🍲 **Dagens ret** – dagens middag + ugeplan for de kommende 7 dage
- 🥡 **Bestil dagens ret** – antal, to-go/spis her, navn, telefon, dato og tidspunkt
- 📖 **Menukort** – pr. ugedag + fast sortiment i kategorier
- 🎉 **Booking** – book arrangement eller fysisk møde (kun ledige dage kan vælges)
- 🕐 **Åbningstider & kontakt** – med "åbent nu"-status

### Admin (`admin.html` – "Personale-login" i footeren)
- 🔑 PIN-login (standard-PIN: **9399** – skift den under Indstillinger!)
- 📊 **Dagligt overblik**: kuverter, bestillinger, to-go vs. spiser her, nye bookinger
- 🔔 **Notifikationer** for nye bestillinger og bookinger
- 🥡 **Bestillinger** pr. dag – markér som håndteret
- 📅 **Bookinger** – bekræft/afvis + blokér datoer, så de ikke kan bookes
- 🍲 **Dagens ret-planlægger** – planlæg op til 14 dage frem
- 📖 **Menukort-editor** og 🕐 **åbningstids-editor**
- 💾 Backup som JSON + nulstil demo-data

## Filer

| Fil | Formål |
|-----|--------|
| `index.html` | Hjemmesiden (hero, dagens ret, bestilling, menukort, om, booking, kontakt) |
| `admin.html` | Chefens dashboard |
| `css/style.css` / `css/admin.css` | Styling |
| `js/store.js` | Fælles datalag (localStorage + synk på tværs af faner) |
| `js/main.js` / `js/admin.js` | Logik for hhv. hjemmeside og dashboard |
| `assets/hero.mp4` | Hero-videoen |

## Vigtigt om data

Data (bestillinger, bookinger, menu) gemmes lige nu i **browserens localStorage**.
Det betyder, at alt virker perfekt som demo og til test – bestiller man på siden,
lander det i admin-dashboardet med det samme (også i en anden fane).

**Men:** data deles ikke mellem forskellige enheder. Skal kundernes bestillinger
lande på chefens computer/telefon i drift, skal `js/store.js` kobles på en lille
backend (fx Supabase eller Firebase – gratis tier rækker fint). Datalaget er
bygget, så det er en isoleret udskiftning – resten af koden skal ikke røres.

## Deploy

Siden deployes via GitHub Pages-workflowet i `.github/workflows/deploy.yml`
(trigger på `main`). Merge denne branch til `main`, så er den live.
