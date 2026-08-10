-- ============================================================
-- SPIIS – FIND EN BESTILLING (diagnose)
-- Kør i Supabase → SQL Editor → Run, og send hele resultatet videre.
--
-- Den ÆNDRER INTET. Den kigger kun.
--
-- Alt kommer i ÉN tabel, fordi SQL Editor kun viser resultatet af
-- den sidste forespørgsel i en fil.
-- ============================================================

with tal as (
  select
    count(*)                                        as i_alt,
    count(*) filter (where date >= current_date)    as fremad,
    count(*) filter (where status = 'ny')           as mangler,
    max(created_at)                                 as nyeste,
    min(created_at)                                 as aeldste
  from public.orders
),
senest as (
  select o.*, row_number() over (order by created_at desc) as nr
  from public.orders o
  order by created_at desc
  limit 30
)

select * from (

  -- 1) Kort status
  select 1 as sortering, '① OVERBLIK' as sektion,
         'Bestillinger i databasen i alt: ' || i_alt
         || '  ·  til i dag og frem: ' || fremad
         || '  ·  mangler at blive kørt: ' || mangler as linje
  from tal
  union all
  select 1, '① OVERBLIK',
         'Nyeste modtaget: ' || coalesce(to_char(nyeste at time zone 'Europe/Copenhagen', 'DD-MM-YYYY HH24:MI'), '(ingen)')
         || '  ·  ældste: ' || coalesce(to_char(aeldste at time zone 'Europe/Copenhagen', 'DD-MM-YYYY HH24:MI'), '(ingen)')
  from tal

  -- 2) Er der nogen der hedder noget med "jens"?
  union all
  select 2, '② SØGT PÅ "JENS"',
         coalesce(
           (select string_agg(
              to_char(created_at at time zone 'Europe/Copenhagen', 'DD-MM HH24:MI')
              || ' · ' || name || ' · ' || phone
              || ' · skal hentes ' || to_char(date, 'DD-MM') || ' kl. ' || coalesce(time, '?')
              || ' · ' || status, E'\n')
            from public.orders where name ilike '%jens%'),
           'INGEN bestilling med "jens" i navnet – den nåede aldrig databasen')

  -- 3) De 30 senest modtagne, uanset dato
  union all
  select 3, '③ SENEST MODTAGET',
         lpad(nr::text, 2) || '. '
         || to_char(created_at at time zone 'Europe/Copenhagen', 'DD-MM HH24:MI')
         || ' · ' || coalesce(name, '?')
         || ' · henter ' || to_char(date, 'DD-MM') || ' kl. ' || coalesce(time, '?')
         || ' · ' || status
         || ' · ' || coalesce((select string_agg((i->>'qty') || '× ' || (i->>'name'), ' + ')
                                 from jsonb_array_elements(items) i), 'ingen varer')
  from senest

  -- 4) Kan noget i databasen afvise en ordre?
  union all
  select 4, '④ TRIGGERS PÅ ORDERS',
         coalesce(
           (select string_agg(tgname || ' (' || case when tgenabled = 'D' then 'SLÅET FRA' else 'aktiv' end || ')', ', ')
              from pg_trigger where tgrelid = 'public.orders'::regclass and not tgisinternal),
           'ingen – intet kan afvise en ordre på databaseniveau')

  -- 5) Findes bestillings-funktionen? Uden den kan INGEN kunde bestille
  union all
  select 5, '⑤ FUNKTIONER',
         coalesce(
           (select string_agg(routine_name, ', ')
              from information_schema.routines
             where routine_schema = 'public'
               and routine_name in ('place_order', 'place_news_order', 'is_admin')),
           'MANGLER – place_order findes ikke, så ingen bestilling kan komme ind!')

  -- 6) Rettigheder: kunder skal kunne oprette, personalet skal kunne læse
  union all
  select 6, '⑥ RETTIGHEDER',
         coalesce((select string_agg(policyname || ' → ' || cmd, ', ' order by cmd)
                     from pg_policies where schemaname = 'public' and tablename = 'orders'),
                  'ingen regler')
  union all
  select 6, '⑥ RETTIGHEDER',
         case when exists (select 1 from information_schema.routines
                            where routine_schema = 'public' and routine_name = 'place_order')
              then 'OK: bestillinger oprettes gennem place_order, derfor er der ingen INSERT-regel – det er som det skal være'
              else 'ADVARSEL: der er hverken en INSERT-regel eller en place_order-funktion'
         end

  -- 7) Er der overhovedet ÅBENT for bestillinger lige nu?
  union all
  select 7, '⑦ ER DER ÅBENT?',
         case when coalesce((data->'settings'->>'ordersPaused')::boolean, false)
              then 'LUKKET: nødbremsen er slået TIL – ingen kan bestille online. Slå den fra under Åbningstider i admin.'
              else 'Åbent: nødbremsen er slået fra' end
  from public.config where id = 1
  union all
  select 7, '⑦ ER DER ÅBENT?',
         'Lukkede dage: ' || coalesce(nullif((select string_agg(d, ', ' order by d)
                                                from jsonb_array_elements_text(coalesce(data->'blockedDates','[]'::jsonb)) t(d)
                                               where d >= to_char(current_date, 'YYYY-MM-DD')), ''), 'ingen fremover')
  from public.config where id = 1
  union all
  select 7, '⑦ ER DER ÅBENT?',
         case when coalesce((data->'closure'->>'active')::boolean, false)
              then 'FERIE er slået TIL – forsiden viser ferielukket' else 'Ingen ferie slået til' end
  from public.config where id = 1

  -- 8) Står ugens dagens ret der stadig?
  union all
  select 8, '⑧ UGENS RETTER',
         to_char(dg::date, 'DD-MM') || ': ' ||
         coalesce((select string_agg(x->>'title', ' ELLER ')
                     from jsonb_array_elements(
                            case jsonb_typeof(data->'dagensRet'->to_char(dg, 'YYYY-MM-DD'))
                              when 'array'  then data->'dagensRet'->to_char(dg, 'YYYY-MM-DD')
                              when 'object' then jsonb_build_array(data->'dagensRet'->to_char(dg, 'YYYY-MM-DD'))
                              else '[]'::jsonb end) x), '— ingen ret sat')
  from public.config,
       generate_series(current_date, current_date + 6, interval '1 day') dg
  where id = 1

) x
order by sortering, linje;
