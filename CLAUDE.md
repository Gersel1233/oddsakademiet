# Spiis — læs det her først

Det her repo er **spiis.dk**, som er i drift med rigtige, betalende kunder.
Køkkenet i Karlslunde Idrætsforening tager imod bestillinger gennem det hver dag.
En fejl her betyder ikke en rød test — det betyder en kunde, der møder op
forgæves, eller et køkken, der ikke kan se sine bestillinger midt i en vagt.

Skriv på dansk. Både i koden, i kommentarerne og til Mikkel, som ejer siden og
ikke er programmør.

## Den vigtigste regel

**Intet går live uden Mikkels udtrykkelige ja.** Hver gang. Også små ting.
Især små ting.

Der er to grene:

| Gren | Hvad den gør |
|---|---|
| `claude/spiis-restaurant-site-hbq4ik` | Udvikling. Udgiver **ikke**. Arbejd her. |
| `claude/zen-davinci-m2j0ah` | **Den eneste gren der går live på spiis.dk.** |

Push aldrig til deploy-grenen, før Mikkel har sagt go. Når det er lagt op:
bekræft at deployet er grønt, og sig ærligt hvad du ikke kunne verificere.

## Sådan hænger det sammen

- Almindelig HTML/CSS/JavaScript. Intet byggetrin. GitHub Pages.
- `js/store.js` er det eneste sted, der taler med databasen — både for
  hjemmesiden og for admin.
- Databasen er Supabase. Hele konfigurationen ligger som **én række** i
  tabellen `config`.
- **Alle bestillinger går gennem databasefunktionen `place_order`.** Aldrig et
  direkte INSERT fra browseren. Den låser konfigurationsrækken, så to kunder
  ikke kan købe den samme sidste portion.
- `supabase/*.sql` er ændringer til databasen. De køres i hånden af Mikkel i
  Supabase' SQL-editor — de kører ikke af sig selv.

## Regler der er købt dyrt

Hver af dem kommer af noget, der faktisk gik galt i produktion.

1. **Databasen skal afvise alt det, hjemmesiden afviser.** En kundes browser
   kan være dage gammel. Hjemmesiden er høflighed; databasen er den eneste dør,
   der virkelig er låst.
2. **Aldrig en falsk kvittering.** Kan databasen ikke nås, så sig det ærligt og
   giv telefonnummeret. Gem aldrig en bestilling lokalt som nødløsning — den
   ville aldrig nå køkkenet.
3. **Vis aldrig en total, der ikke er hele beløbet.** En manglende pris er ikke
   nul.
4. **Alt kunden vælger skal være data, ikke tekst i en beskrivelse.** Ellers
   kan køkkenet ikke se det på sedlen.
5. **Alt der kan fejle, skal prøve igen af sig selv.** Et køkken midt i en vagt
   har ikke overskud til at genindlæse noget.
6. **Spørg småt og tit, hent stort og sjældent.** Databasen har en datagrænse,
   og den er blevet ramt én gang.

Den fulde baggrund med symptomer og årsager står i `LAERT-AF-SPIIS.md`, hvis
den ligger her.

## Test

Test mod en **lokal kopi**, aldrig mod produktionsdatabasen. Tøm
`js/config.js` (`url: ''`), så kører siden lokalt på egne data. Playwright og
Chromium ligger klar i `/opt/pw-browsers`.

Skriv testnavne på dansk som noget, der kan ske:
`✓ udsolgt ret kan ikke bestilles` — ikke `✓ soldout flag blocks order`.

Kan du ikke fremvise fejlen **før** rettelsen, ved du ikke, om du har rettet
noget.

## gstack

Repoet henter [gstack](https://github.com/garrytan/gstack) automatisk, når en
session starter (`.claude/hooks/install-gstack.sh`, ca. 15 sekunder). Det giver
slash-kommandoer som `/review`, `/investigate`, `/retro` og `/health`.

**Brug ikke `/ship`, `/land-and-deploy` eller `/canary` i det her repo.** De
lægger ting live på egen hånd, og det bryder reglen øverst i filen.

Browser-delen (`/qa`, `/browse`, `/design-review`, `/scrape`) virker ikke i
sky-sessioner: proxyen bryder krypteringen, og Chromium stoler ikke på den.
Slå aldrig krypteringstjek fra for at komme udenom. På en almindelig computer
virker de fint.
