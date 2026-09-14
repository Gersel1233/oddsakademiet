-- ============================================================
-- ÅBNINGSTIDERNE SKAL OGSÅ GÆLDE I DATABASEN
--
-- Hjemmesiden skjuler dage, hvor I har lukket. Men databasen
-- tjekkede det aldrig. Sad en kunde med siden åben fra i går – eller
-- havde telefonen gemt en gammel udgave – kunne bestillingen gå
-- lige igennem på en lukket dag. Køkkenet stod så med en kunde i
-- døren på en dag, der var lukket.
--
-- Databasen afviser i forvejen syv ting: nødbremsen, blokerede
-- datoer, lukkede bestillingsdage, "kun take-away i dag", ferie,
-- tidspunkt uden for vinduet, og udsolgt. Åbningstiderne manglede.
-- Nu er de der også.
--
-- SÅDAN ER DEN SKREVET, OG HVORFOR:
-- Den her fil skriver IKKE place_order om. Der findes flere udgaver
-- af den funktion, og jeg kan ikke vide, præcis hvilken der kører
-- hos jer. Skrev jeg min egen udgave ovenpå, kunne jeg komme til at
-- fjerne noget, I allerede har.
--
-- I stedet læser den jeres EGEN funktion, som den er lige nu, og
-- sætter ét tjek ind i den. Alt andet står præcis som før.
--
-- · Er tjekket der allerede, gør den ingenting.
-- · Kan den ikke finde stedet at sætte det ind, stopper den med en
--   fejl og ændrer ingenting.
--
-- Køres ÉN gang i Supabase → SQL Editor → Run.
-- Rører ikke bestillinger, bookinger, menukort eller tider.
-- ============================================================

do $$
declare
  v_src   text;
  v_ny    text;
  -- den her linje står ordret i hver eneste udgave af funktionen
  v_anker text := '  select data into v_cfg from config where id = 1 for update;';
  v_tjek  text;
begin
  select pg_get_functiondef(p.oid)
    into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'place_order'
   limit 1;

  if v_src is null then
    raise exception 'Fandt ingen place_order i databasen. Kør setup.sql først.';
  end if;

  if position('AABNINGSTID-TJEK' in v_src) > 0 then
    raise notice 'Åbningstiderne tjekkes allerede – intet blev ændret.';
    return;
  end if;

  if position(v_anker in v_src) = 0 then
    raise exception 'Kunne ikke finde stedet at sætte tjekket ind i place_order. '
                    'Intet er ændret. Sig til, så kigger jeg på jeres udgave.';
  end if;

  -- 0 = mandag ... 6 = søndag, præcis som hjemmesiden regner ugedage.
  -- isodow giver 1 = mandag ... 7 = søndag, så vi trækker én fra.
  v_tjek :=
    E'\n  -- AABNINGSTID-TJEK: har I lukket den ugedag, tager vi ikke imod.'
    || E'\n  -- Gaelder OGSAA en kunde med en gammel side aaben.'
    || E'\n  if coalesce('
    || E'\n       (v_cfg->''hours''->((extract(isodow from p_date)::int - 1))->>''closed'')::boolean,'
    || E'\n       false) then'
    || E'\n    return jsonb_build_object(''ok'', false, ''reason'', ''lukket'');'
    || E'\n  end if;';

  v_ny := replace(v_src, v_anker, v_anker || v_tjek);

  if v_ny = v_src then
    raise exception 'Indsættelsen gjorde ingen forskel. Intet er ændret.';
  end if;

  execute v_ny;
  raise notice 'Klar: åbningstiderne gælder nu også i databasen.';
end $$;

-- ------------------------------------------------------------
-- TJEK AT DET VIRKEDE
-- Skal vise "ja" ud for både aabningstider og alt det andet, der
-- var der i forvejen. Står der "nej" ved noget, så sig til.
-- ------------------------------------------------------------
select
  case when position('AABNINGSTID-TJEK' in def) > 0 then 'ja' else 'NEJ' end as aabningstider,
  case when position('type-lukket'      in def) > 0 then 'ja' else 'NEJ' end as kun_den_ene_maade,
  case when position('blockedDates'     in def) > 0 then 'ja' else 'NEJ' end as blokerede_dage,
  case when position('orderClosedDates' in def) > 0 then 'ja' else 'NEJ' end as lukkede_bestillingsdage,
  case when position('ordersPaused'     in def) > 0 then 'ja' else 'NEJ' end as noedbremsen,
  case when position('closure'          in def) > 0 then 'ja' else 'NEJ' end as ferie,
  case when position('soldout'          in def) > 0 then 'ja' else 'NEJ' end as udsolgt,
  case when position('dayTimes'         in def) > 0 then 'ja' else 'NEJ' end as egne_tider_pr_dag
from (
  select pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'place_order'
   limit 1
) s;
