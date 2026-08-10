-- ============================================================
-- SPIIS – LÆS LOGBOGEN
-- Kør i Supabase → SQL Editor → Run. Ændrer intet.
--
-- Kræver at supabase/logbog.sql er kørt først.
--
-- Sådan læses den:
--   oprettet + rolle "anon"           → en kunde bestilte på hjemmesiden
--   oprettet + en e-mail i af_hvem    → oprettet i admin af personalet
--   ændret                            → fx "✓ Færdig" eller "læst"
--   SLETTET + en e-mail i af_hvem     → nogen slettede den fra admin
--   SLETTET uden e-mail               → slettet direkte i databasen
--
-- Står der 'oprettet' men ingen 'SLETTET', og bestillingen alligevel
-- ikke er i orders → så er den forsvundet uden om appen, og så skal
-- vi kigge på databasen selv.
-- Står der slet ingenting → bestillingen nåede aldrig databasen.
-- ============================================================

select
  to_char(hvornaar at time zone 'Europe/Copenhagen', 'DD-MM HH24:MI:SS') as tidspunkt,
  handling,
  coalesce(kunde, '?')                       as kunde,
  to_char(dato, 'DD-MM')                     as skal_hentes,
  coalesce(klokken, '?')                     as klokken,
  coalesce(varer, '—')                       as varer,
  af_hvem,
  rolle
from public.order_log
order by hvornaar desc, log_id desc
limit 100;
