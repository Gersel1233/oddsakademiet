-- ============================================================
-- SPIIS – KLAR TIL UGE 33  (mandag 10. – lørdag 15. august 2026)
-- Kør ÉN gang i Supabase → SQL Editor → Run.
--
-- Den sætter:
--   1) Dagens ret for hele ugen (109 kr.) – torsdag med to valgmuligheder
--   2) Fredag + lørdag lukket: 👥 Personaletur
--   3) Nyheder: KUN J-dag-opslaget med plakaten
--   4) Spiis-brød på menukortet (40 kr.) – kun hvis det ikke er der i forvejen
--   5) Slukker en evt. gammel ferie-besked
--   6) Afhentning kl. 16–19, som der står på ugesedlen
--
-- Den RØRER IKKE: bestillinger, bookinger, resten af menukortet,
-- dagens retter på andre datoer, login eller indstillinger i øvrigt.
-- ============================================================

-- ── 1) DAGENS RET FOR UGEN ──────────────────────────────────
-- Fletter ind i det der allerede ligger; fredag og lørdag ryddes,
-- så der ikke hænger en gammel ret på en lukket dag.
update public.config
set data = jsonb_set(
      data,
      '{dagensRet}',
      ((coalesce(data->'dagensRet', '{}'::jsonb) - '2026-08-14') - '2026-08-15')
      || '{
        "2026-08-10": { "title": "Boller i karry",            "desc": "Med ris",                                                  "price": 109 },
        "2026-08-11": { "title": "Gammeldags oksesteg",       "desc": "Med kartofler, haricots verts, gulerødder og sauce",       "price": 109 },
        "2026-08-12": { "title": "Kartoffelwraps med kylling","desc": "Med salat",                                                "price": 109 },
        "2026-08-13": [
          { "title": "Bao med nakkefilet",   "desc": "Med ris og teriyaki på siden",     "price": 109 },
          { "title": "Pulled pork burger",   "desc": "Med coleslaw og ovnkartofler",     "price": 109 }
        ]
      }'::jsonb
    ),
    updated_at = now()
where id = 1;

-- ── 2) FREDAG + LØRDAG: PERSONALETUR ────────────────────────
-- blockedDates      = lukket for både booking og madbestilling
-- orderClosedDates  = lukket for madbestilling
-- dayMarks          = hvad der står i kalenderen i stedet for bare "lukket"
update public.config
set data = data || jsonb_build_object(
      'blockedDates', (
        select coalesce(jsonb_agg(distinct d order by d), '[]'::jsonb)
        from jsonb_array_elements_text(
               coalesce(data->'blockedDates', '[]'::jsonb)
               || '["2026-08-14","2026-08-15"]'::jsonb) as t(d)
      ),
      'orderClosedDates', (
        select coalesce(jsonb_agg(distinct d order by d), '[]'::jsonb)
        from jsonb_array_elements_text(
               coalesce(data->'orderClosedDates', '[]'::jsonb)
               || '["2026-08-14","2026-08-15"]'::jsonb) as t(d)
      ),
      'dayMarks',
      coalesce(data->'dayMarks', '{}'::jsonb) || '{
        "2026-08-14": { "e": "👥", "t": "Personaletur" },
        "2026-08-15": { "e": "👥", "t": "Personaletur" }
      }'::jsonb
    ),
    updated_at = now()
where id = 1;

-- ── 3) NYHEDER: KUN J-DAG ───────────────────────────────────
update public.config
set data = jsonb_set(
      data,
      '{news}',
      jsonb_build_array(jsonb_build_object(
        'id',        'jdag-2026',
        'title',     'J-dag hos Spiis/Kiffen 🍺',
        'text',      E'Der er ikke længe til, at Tuborgs Julebryg bliver frigivet – og det skal selvfølgelig fejres! Vi lover et brag af fest her hos Spiis/Kiffen.\n\nDer er allerede mange, der gerne vil reservere plads, så skynd jer at sætte kryds i kalenderen. Vi har lidt overraskelser i ærmet, og vi glæder os til en uforglemmelig aften sammen.\n\nVil I være sikre på plads? Ring til os på 93 99 58 58 eller skriv til spiis.bestilling@gmail.com.',
        'image',     'assets/nyhed-jdag.jpg',
        'active',    true,
        'createdAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      ))
    ),
    updated_at = now()
where id = 1;

-- ── 4) SPIIS-BRØD PÅ MENUKORTET ─────────────────────────────
-- Står på ugesedlen til 40 kr. pr. styk. Lægges kun ind, hvis det
-- ikke allerede findes, så filen kan køres igen uden dubletter.
update public.config
set data = jsonb_set(
      data,
      '{menu,categories}',
      coalesce(data->'menu'->'categories', '[]'::jsonb) || '[
        {
          "id": "tilbehoer", "name": "Tilbehør", "availability": "alle",
          "items": [
            { "name": "Spiis-brød", "desc": "Langtidshævet – bagt hos os.", "price": 40 }
          ]
        }
      ]'::jsonb
    ),
    updated_at = now()
where id = 1
  and coalesce(data->'menu'->'categories', '[]'::jsonb)::text not ilike '%spiis-brød%';

-- ── 5) INGEN GAMMEL FERIE-BESKED ────────────────────────────
update public.config
set data = data || jsonb_build_object(
      'closure', coalesce(data->'closure', '{}'::jsonb) || '{"active": false}'::jsonb
    ),
    updated_at = now()
where id = 1;

-- ── 6) AFHENTNING KL. 16–19 ─────────────────────────────────
update public.config
set data = jsonb_set(
      data, '{settings}',
      coalesce(data->'settings', '{}'::jsonb)
      || '{"orderFrom": "16:00", "orderToTogo": "19:00", "orderToDine": "19:00"}'::jsonb
    ),
    updated_at = now()
where id = 1;

-- ── TJEK: sådan ser ugen ud nu ──────────────────────────────
select
  d.dato,
  coalesce(
    (select string_agg(x->>'title', '  ELLER  ')
       from jsonb_array_elements(
              case jsonb_typeof(data->'dagensRet'->d.dato)
                when 'array' then data->'dagensRet'->d.dato
                when 'object' then jsonb_build_array(data->'dagensRet'->d.dato)
                else '[]'::jsonb
              end) x),
    '—') as dagens_ret,
  case when data->'blockedDates' ? d.dato
       then coalesce(data->'dayMarks'->d.dato->>'e', '') || ' ' ||
            coalesce(data->'dayMarks'->d.dato->>'t', 'Lukket')
       else 'Åbent' end as status
from public.config,
     (values ('2026-08-10'),('2026-08-11'),('2026-08-12'),
             ('2026-08-13'),('2026-08-14'),('2026-08-15')) as d(dato)
where id = 1
order by d.dato;
