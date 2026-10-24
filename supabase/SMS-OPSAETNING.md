# SMS til kunden – sådan slås det til

Når en kunde bestiller på hjemmesiden, får de to sms'er fra **Spiis**:

1. **Med det samme:** "Tak, Mikkel! Spiis har din bestilling: 2 x Boller i karry, afhentning man. 26/10 kl. 17:30. Påmindelse kommer 30 min før. Afbud: 93 99 58 58"
2. **Ca. 30 min før:** "Hej Mikkel! Om ca. 30 min er din mad klar til afhentning hos Spiis (kl. 17:30). Kongens Enge 42, Karlslunde. Vi glæder os! Mvh Spiis"

Hver besked er én sms, så en bestilling koster 2 sms'er. Kun bestillinger fra hjemmesiden får sms – ikke dem, køkkenet selv taster ind i admin. Bestiller man under en time før, kommer kun bekræftelsen.

Sms'en sendes først, når bestillingen er gemt. Går noget galt med sms'en, er bestillingen der stadig.

Tid: ca. 20 minutter, én gang.

---

## Trin 1 – SMS-konto (GatewayAPI)
1. Gå til **gatewayapi.com** → opret en konto, og bekræft e-mail og telefon.
2. Sæt et beløb ind på kontoen (fx 100 kr.).
3. Find **API → API Keys** → opret en nøgle → kopiér **Token**. Gem den et sted, du kan finde den igen om lidt.

## Trin 2 – Lav en hemmelig kode (i Supabase)
1. Log ind på **supabase.com** og åbn Spiis-projektet.
2. Venstre menu: **SQL Editor** → **New query**.
3. Skriv: `select encode(gen_random_bytes(24), 'hex');` → **Run**.
4. Kopiér den lange kode, der kommer frem. Det er jeres **hemmelige kode** – den skal bruges to steder herunder.

## Trin 3 – Læg sms-funktionen op
1. Venstre menu: **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Navn: `send-sms` (præcis sådan).
3. Slet eksempelkoden, og indsæt hele filen `supabase/send-sms.ts` (på GitHub: åbn filen → knappen **Copy raw file**).
4. **Deploy**.
5. Åbn funktionen → **Details** → slå **Enforce JWT verification** (Verify JWT) **FRA** → **Save**.

## Trin 4 – Fire hemmelige værdier
**Edge Functions → Secrets** (Manage secrets) → tilføj:

| Navn | Værdi |
|---|---|
| `GATEWAYAPI_TOKEN` | token'et fra trin 1 |
| `SMS_SECRET` | den hemmelige kode fra trin 2 |
| `SMS_AKTIV` | `ja` |
| `SMS_KUN_TIL` | dit eget mobilnummer (fx `12345678`) |

`SMS_KUN_TIL` gør, at sms'erne KUN går til dig, mens du prøver.

## Trin 5 – Databasen
1. **SQL Editor** → **New query** → indsæt (med jeres hemmelige kode i stedet for teksten):
   `select vault.create_secret('JERES-HEMMELIGE-KODE', 'spiis_sms_secret');` → **Run**.
2. **New query** → indsæt hele filen `supabase/sms.sql` → **Run**. Der skal stå *Success*.
   Får du en fejl om `pg_cron` eller `pg_net`: gå til **Database → Extensions**, slå `pg_cron` og `pg_net` til, og kør filen igen.

## Trin 6 – Prøv det
1. Bestil noget på hjemmesiden med **dit eget nummer**, "TEST" i beskeden, og til et tidspunkt **mindst en time frem**.
2. Du får bekræftelsen med det samme – og påmindelsen ca. 30 min før.
3. Slet testbestillingen i admin bagefter.

Kommer der ingen sms? Se **Edge Functions → send-sms → Logs**. Står der "ugyldigt nummer", "SMS_KUN_TIL" eller "sms fejlede", står grunden lige der.

## Trin 7 – Tænd for alle kunder
**Edge Functions → Secrets** → slet `SMS_KUN_TIL`. Færdig.

---

## Sluk igen
Sæt `SMS_AKTIV` til `nej` under Edge Functions → Secrets. Så sendes der ingenting, med det samme, og intet andet ændrer sig.
