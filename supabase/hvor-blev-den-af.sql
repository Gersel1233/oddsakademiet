-- ============================================================
-- HVOR BLEV DEN BESTILLING AF?
--
-- Kør i Supabase → SQL Editor → Run. Ændrer ingenting.
--
-- Svarer på: kom bestillingen ind? ligger den der stadig?
-- og hvis ikke – hvem slettede den, og hvornår?
--
-- Vil du kun se én bestemt person, så skriv navnet her:
--        ↓↓↓ (lad stå tomt for at se alt fra det seneste døgn)
-- ============================================================

with sog as (select ''::text as navn),        --  ← fx: select 'Janni'::text as navn

     /* alt der er sket det seneste døgn (eller kun det valgte navn) */
     haendelser as (
       select l.*
         from public.order_log l, sog s
        where (s.navn = '' and l.hvornaar > now() - interval '24 hours')
           or (s.navn <> '' and l.kunde ilike '%' || s.navn || '%')
     )

select
  to_char(h.hvornaar at time zone 'Europe/Copenhagen', 'DD/MM HH24:MI:SS') as tidspunkt,

  case h.handling
    when 'oprettet' then '🆕 KOM IND'
    when 'ændret'   then '✏️ blev rettet'
    when 'SLETTET'  then '🗑 BLEV SLETTET'
    else h.handling
  end as hvad_skete_der,

  coalesce(h.kunde, '(uden navn)') as kunde,
  coalesce(h.varer, '(ingen varer)') as bestilte,
  to_char(h.dato, 'DD/MM') || ' kl. ' || coalesce(h.klokken, '–') as skulle_hentes,

  case
    when h.rolle = 'anon' then 'kunden selv, fra hjemmesiden'
    when h.af_hvem is not null and h.af_hvem <> '(ingen)' then h.af_hvem
    when h.rolle = 'authenticated' then 'personalet (ukendt bruger)'
    else 'direkte i databasen'
  end as hvem,

  /* og det vigtigste: findes rækken stadig? */
  case when exists (select 1 from public.orders o where o.id = h.order_id)
       then '✅ ligger i admin nu'
       else '❌ er ikke i databasen længere'
  end as findes_den_stadig

from haendelser h
order by h.hvornaar desc
limit 100;

-- ── Sådan læser du svaret ───────────────────────────────────
--
-- Står der KOM IND, men ingen SLETTET, og "✅ ligger i admin nu":
--     → bestillingen er der. Kan du ikke se den i admin, står du på
--       den forkerte dato – prøv 📚 Alle dage.
--
-- Står der både KOM IND og BLEV SLETTET:
--     → nogen har slettet den. Kolonnen "hvem" siger hvem.
--       Den kan IKKE hentes tilbage – men her står hvad der var i den.
--
-- Står der slet ingenting om bestillingen:
--     → den er aldrig nået frem til databasen. Så er der en fejl,
--       og så skal du sige til.
