-- ============================================================
-- ER VI KLAR TIL AT ÅBNE?
--
-- Kør denne ÉNE gang i Supabase → SQL Editor → Run.
-- Den ændrer INGENTING. Den kigger kun og svarer på hver linje:
--
--    ✅ KLAR         = den ting er i orden
--    ❌ IKKE KLAR    = den skal ordnes, før vi åbner
--    ℹ️ til info      = bare godt at vide
--
-- Tag et screenshot af hele svaret.
-- ============================================================

with c as (select data from public.config where id = 1),

     /* mandag i denne uge, så tjekket passer uge efter uge */
     uge as (
       select (current_date - ((extract(isodow from current_date)::int - 1)))::date as man
     ),

     dage as (
       select to_char(u.man + g, 'YYYY-MM-DD') as dato,
              g as nr           -- 0=man, 1=tir, … 6=søn
         from uge u, generate_series(0, 6) g
     ),

     /* hvor mange af ugens dage har en ret? (lukkede dage tæller ikke med) */
     retter as (
       select count(*) filter (
                where jsonb_array_length(
                        case jsonb_typeof(c.data->'dagensRet'->d.dato)
                          when 'array'  then c.data->'dagensRet'->d.dato
                          when 'object' then jsonb_build_array(c.data->'dagensRet'->d.dato)
                          else '[]'::jsonb
                        end) > 0
              ) as med_ret,
              count(*) filter (
                where jsonb_exists(coalesce(c.data->'blockedDates', '[]'::jsonb), d.dato)
              ) as lukkede
         from dage d, c
     )

select * from (

  select 1 as nr, 'Bestillinger er tændt' as hvad,
         case when coalesce((data->'settings'->>'ordersPaused')::boolean, false)
              then '❌ IKKE KLAR' else '✅ KLAR' end as svar,
         case when coalesce((data->'settings'->>'ordersPaused')::boolean, false)
              then 'Nødbremsen er trukket. Slå den fra i admin → Åbningstider.'
              else 'Kunder kan bestille online.' end as forklaring
    from c

  union all
  select 2, 'Ugens dagens ret er lagt ind',
         case when r.med_ret > 0 then '✅ KLAR' else '❌ IKKE KLAR' end,
         btrim(r.med_ret || ' dage har en ret · ' || r.lukkede || ' dage er lukket. '
         || case when r.med_ret = 0 then 'Kør uge-33.sql, eller læg retterne ind i admin → Dagens ret.' else '' end)
    from retter r

  union all
  select 3, 'Afhentningstider',
         case when data->'settings'->>'orderFrom' is not null
               and data->'settings'->>'orderToTogo' is not null
              then '✅ KLAR' else '❌ IKKE KLAR' end,
         'fra ' || coalesce(data->'settings'->>'orderFrom', '?')
                || ' til ' || coalesce(data->'settings'->>'orderToTogo', '?')
    from c

  union all
  select 4, 'Ferielukning',
         case when coalesce((data->'closure'->>'active')::boolean, false)
              then '❌ IKKE KLAR' else '✅ KLAR' end,
         case when coalesce((data->'closure'->>'active')::boolean, false)
              then 'Der står FERIELUKKET på forsiden lige nu!'
              else 'Ingen ferie-banner på forsiden.' end
    from c

  union all
  select 5, 'Nyheder på forsiden',
         '✅ KLAR',
         coalesce(jsonb_array_length(data->'news'), 0) || ' nyhed(er): '
         || coalesce((select string_agg(n->>'title', ' · ')
                        from jsonb_array_elements(coalesce(data->'news', '[]'::jsonb)) n), 'ingen')
    from c

  union all
  select 6, 'Bestillinger kan nå databasen',
         case when exists (
                select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                 where s.nspname = 'public' and p.proname = 'place_order')
              then '✅ KLAR' else '❌ IKKE KLAR' end,
         'place_order er den eneste vej ind for en bestilling.'

  union all
  select 7, 'Notifikation når der kommer en bestilling',
         case when exists (select 1 from pg_trigger where tgname like '%push%' and not tgisinternal)
              then '✅ KLAR' else '❌ IKKE KLAR' end,
         coalesce((select string_agg(tgname, ', ') from pg_trigger
                    where tgname like '%push%' and not tgisinternal), 'ingen trigger fundet')

  union all
  select 8, 'Logbog over bestillinger',
         case when exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'order_log')
              then '✅ KLAR' else '❌ IKKE KLAR' end,
         case when exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'order_log')
              then 'Alt hvad der sker med en bestilling bliver skrevet ned – også hvis den slettes.'
              else 'Kør logbog.sql.' end

  union all
  select 8.1, 'Skraldespand – slettede kan hentes tilbage',
         case when exists (
                select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                 where s.nspname = 'public' and p.proname = 'gendan_bestilling')
              then '✅ KLAR' else '❌ IKKE KLAR' end,
         case when exists (
                select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                 where s.nspname = 'public' and p.proname = 'gendan_bestilling')
              then 'En slettet bestilling kan lægges tilbage i 30 dage.'
              else 'Kør opdatering-skraldespand.sql.' end

  union all
  select 8.2, 'Egne tider pr. dag & luk kun den ene spisemåde',
         case when exists (
                select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                 where s.nspname = 'public' and p.proname = 'spiis_type_lukket')
              and (select prosrc from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                    where s.nspname = 'public' and p.proname = 'place_order' limit 1) like '%dayTimes%'
              then '✅ KLAR' else '❌ IKKE KLAR' end,
         'Databasen kender dagens egne tider og lukning af én spisemåde.'

  union all
  select 9, 'Bestillinger i databasen lige nu',
         'ℹ️ til info',
         (select count(*) from public.orders)::text || ' i alt · '
         || (select count(*) from public.orders where created_at > now() - interval '24 hours')::text
         || ' det seneste døgn'

  union all
  select 10, 'Bookinger i databasen lige nu',
         'ℹ️ til info',
         (select count(*) from public.bookings)::text || ' i alt'

  union all
  select 11, 'Nyeste bestilling',
         'ℹ️ til info',
         coalesce((select to_char(created_at at time zone 'Europe/Copenhagen', 'DD/MM HH24:MI')
                          || ' · ' || coalesce(name, '?')
                          || ' · ' || coalesce(date::text, '?')
                     from public.orders order by created_at desc limit 1),
                  'ingen bestillinger endnu')

) tjek order by nr;
