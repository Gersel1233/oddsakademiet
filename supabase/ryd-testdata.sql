-- ============================================================
--  ⚠️  STOP OG LÆS  ⚠️
--
--  DENNE FIL SLETTER **ALLE** BESTILLINGER OG BOOKINGER.
--  Også rigtige kunders. Også dem til i morgen. Alt.
--  Det kan IKKE fortrydes.
--
--  Den er kun til ÉN ting: at nulstille alt ÉN gang, lige før
--  personalet tager systemet i brug for første gang.
--
--  Skal du bare af med gamle testbestillinger i den daglige drift?
--  → Brug admin i stedet:
--       Bestillinger → 📚 Alle dage → 🕓 Tidligere dage
--       → "🗑 Slet alle X gamle"
--    Den rører KUN dage der er overstået. I dag og fremad står urørt.
--
--  Vil du finde ud af, hvor en bestilling er blevet af?
--  → Kør supabase/find-bestilling.sql. Den ændrer ingenting.
-- ============================================================
--
--  For at køre den her SKAL du fjerne "-- " forrest på de linjer
--  der står nedenfor. Det er med vilje: så kan man ikke komme til
--  at markere det hele og trykke Run.
--
--  Husk bagefter: lukkedage, ferie og arrangement-dage nulstilles
--  også, så kør supabase/uge-33.sql (eller sæt dagene igen i admin),
--  ellers står fredag og lørdag åbne igen.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- FJERN "-- " FORREST PÅ DE FIRE BLOKKE HERUNDER FOR AT SLETTE
-- ─────────────────────────────────────────────────────────────

-- 1) alle bookinger væk
-- delete from public.bookings;

-- 2) alle bestillinger væk
-- delete from public.orders;

-- 3) nulstil lukkede dage, arrangement-dage og ferie
-- update public.config
-- set data = data || jsonb_build_object(
--       'blockedDates',     '[]'::jsonb,
--       'arrangementDates', '[]'::jsonb,
--       'orderClosedDates', '[]'::jsonb,
--       'closure', jsonb_build_object('active', false, 'from', '', 'reopen', '', 'message', '')
--     ),
--     updated_at = now()
-- where id = 1;

-- 4) (valgfrit) fjern også nyheder
-- update public.config set data = data || jsonb_build_object('news', '[]'::jsonb),
--        updated_at = now() where id = 1;

-- ─────────────────────────────────────────────────────────────
-- Kører du filen som den er, sker der INTET ud over denne besked:
select 'Der blev IKKE slettet noget. Læs toppen af filen – de slettende '
    || 'linjer er slået fra med vilje. Skal du bare af med gamle '
    || 'testbestillinger, så brug "🗑 Slet alle gamle" i admin i stedet.' as besked;
