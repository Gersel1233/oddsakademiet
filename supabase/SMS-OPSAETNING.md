# SMS til kunden – sådan slås det til

Når en kunde bestiller på hjemmesiden, får de:

1. **En sms med det samme**: "Tak, Mikkel! Spiis har modtaget din bestilling: 2 x Boller i karry til afhentning mandag d. 26. oktober kl. 17:30. Vi sender en påmindelse 30 min før. Kan du ikke komme, så ring 93 99 58 58 senest 1 time før. Mvh Spiis"
2. **En påmindelse ca. 30 min før**: "Hej Mikkel! Om ca. 30 min er din mad klar til afhentning hos Spiis (kl. 17:30). Kongens Enge 42, Karlslunde. Vi glæder os! Mvh Spiis"

Afsenderen hedder **Spiis**. Kun bestillinger fra hjemmesiden får sms – ikke dem, køkkenet selv taster ind i admin. Bestiller man under en time før, kommer der kun bekræftelsen (den lover heller ikke en påmindelse).

Hjemmesiden er ikke ændret for at få det her til at virke: alt sker i databasen, *efter* bestillingen er gemt. Går sms'en galt, er bestillingen der stadig.

## Det kræver (ca. 20 minutter, én gang)

### 1. En sms-konto hos GatewayAPI
- Opret en konto på **gatewayapi.com** (dansk firma, betaling pr. sms).
- Sæt penge ind på kontoen.
- Gå til **API → API Keys** og kopiér **token**'et.

En bestilling bruger typisk 3 sms-dele (bekræftelsen fylder 2, påmindelsen 1).

### 2. Funktionen i Supabase
- Supabase → projektet → **Edge Functions → Deploy a new function** → navn: `send-sms`.
- Indsæt hele indholdet af `supabase/send-sms.ts` → Deploy.
- Under funktionens indstillinger: slå **Verify JWT** FRA.
- **Edge Functions → Secrets**, tilføj:
  - `GATEWAYAPI_TOKEN` = token'et fra trin 1
  - `SMS_SECRET` = en lang tilfældig tekst (fx 40 tegn – find på noget, eller brug en adgangskode-generator)
  - `SMS_AKTIV` = `nej` (til at starte med – så sendes intet, men funktionen skriver i loggen, hvad den *ville* sende)
  - `SMS_KUN_TIL` = dit eget mobilnummer (så går sms'er kun til dig, mens du prøver)

### 3. Databasen
- Supabase → **SQL Editor**.
- Kør først denne ene linje, med den SAMME tekst som `SMS_SECRET`:
  `select vault.create_secret('DIN-LANGE-TILFAELDIGE-TEKST', 'spiis_sms_secret');`
- Kør derefter hele `supabase/sms.sql`.

### 4. Prøv det af
- Sæt `SMS_AKTIV` = `ja` (`SMS_KUN_TIL` står stadig på dit nummer).
- Bestil noget på hjemmesiden med dit eget nummer og "TEST" i beskeden – helst til mindst en time frem.
- Du får bekræftelsen med det samme og påmindelsen ca. 30 min før. Slet testordren i admin bagefter.

### 5. Tænd for alle
- Slet `SMS_KUN_TIL` under Secrets. Nu får alle kunder sms.

## Sluk igen
Sæt `SMS_AKTIV` til `nej` under Edge Functions → Secrets. Så sendes der ingenting, med det samme – og intet andet ændrer sig.
