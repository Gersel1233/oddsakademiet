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

## Data: fælles database (Supabase)

Sitet er koblet på en **Supabase-database** via `js/config.js` (projekt-URL +
anon-nøgle). Når databasen svarer, deles alt på tværs af enheder:

- Kunder kan **oprette** bestillinger og bookinger – men ikke læse dem
  (navne og numre er kun synlige for chefen)
- Bestillinger går gennem databasefunktionen `place_order`, som tjekker
  portionslageret **atomisk** – to kunder kan ikke snuppe de sidste portioner samtidig
- Hjemmesiden viser "X tilbage" via `get_sold` (kun tal, ingen persondata)
- Chefen logger ind i admin med **e-mail + adgangskode** (Supabase Auth);
  kun chefens e-mail (defineret i `is_admin()` i SQL'en) kan læse/ændre data
- Menu, åbningstider, dagens ret og blokerede datoer ligger i `config`-tabellen
  (læsbar for alle, kun chefen kan ændre); dagsnoter er kun for chefen

**Opsætning (én gang):** kør `supabase/setup.sql` i Supabase → SQL Editor,
og opret chefens bruger under Authentication → Users → Add user
(spiis.bestilling@gmail.com + valgfri adgangskode, "Auto Confirm User").

**Fallback:** svarer databasen ikke (eller er `js/config.js` tømt), kører hele
sitet automatisk videre lokalt i browseren med PIN-login (9399) – praktisk til
test og udvikling.

## Deploy

Siden deployes via GitHub Pages-workflowet i `.github/workflows/deploy.yml`
(trigger på `main`). Merge denne branch til `main`, så er den live.
