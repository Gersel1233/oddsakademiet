-- ============================================================
-- SPIIS – FIND EN BESTILLING (diagnose)
-- Kør i Supabase → SQL Editor → Run, og send resultatet videre.
--
-- Den ÆNDRER INTET. Den kigger kun.
-- Formålet er at svare på ét spørgsmål: nåede bestillingen
-- overhovedet frem til databasen?
-- ============================================================

-- ── 1) ALT hvad der ligger i orders, nyeste øverst ──────────
-- Er bestillingen her, er den ikke væk – så er det admin der
-- viser den forkert. Er den her IKKE, nåede den aldrig frem.
select
  created_at at time zone 'Europe/Copenhagen' as modtaget,
  name        as kunde,
  phone       as telefon,
  date        as skal_hentes,
  time        as klokken,
  status,
  read        as set_af_personalet,
  (select string_agg((i->>'qty') || ' × ' || (i->>'name'), ', ')
     from jsonb_array_elements(items) i) as varer
from public.orders
order by created_at desc
limit 50;

-- ── 2) Hvor mange er der i alt, og hvornår kom den sidste? ──
select
  count(*)                                                      as bestillinger_i_alt,
  min(created_at) at time zone 'Europe/Copenhagen'              as aeldste,
  max(created_at) at time zone 'Europe/Copenhagen'              as nyeste,
  count(*) filter (where date >= current_date)                  as til_i_dag_og_frem,
  count(*) filter (where status = 'ny')                         as mangler_at_blive_koert
from public.orders;

-- ── 3) Er der nogen der hedder noget med "jens"? ────────────
select
  created_at at time zone 'Europe/Copenhagen' as modtaget,
  name, phone, date, time, status
from public.orders
where name ilike '%jens%'
order by created_at desc;

-- ── 4) Er der noget i databasen, der kan afvise en ordre? ───
select tgname as trigger_navn,
       case when tgenabled = 'D' then 'SLÅET FRA' else 'aktiv' end as tilstand
from pg_trigger
where tgrelid = 'public.orders'::regclass and not tgisinternal;

-- ── 5) Findes bestillings-funktionen, som hjemmesiden bruger? ─
select routine_name as funktion
from information_schema.routines
where routine_schema = 'public' and routine_name in ('place_order', 'place_news_order');

-- ── 6) Må personalet overhovedet læse bestillinger? ─────────
select policyname as regel, cmd as gaelder_for, qual as betingelse
from pg_policies
where schemaname = 'public' and tablename = 'orders'
order by cmd;
