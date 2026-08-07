-- ============================================================
-- SPIIS TAPAS-REGLEN: tapas skal ALTID bestilles senest dagen før.
-- Køres ÉN gang i Supabase → SQL Editor → Run.
--
-- Reglen håndhæves helt nede i databasen med en trigger, så den
-- gælder uanset hvordan en bestilling kommer ind – ingen kan snige
-- en samme-dags tapas igennem. Rører ikke ved andet.
-- ============================================================

create or replace function public.enforce_tapas_dayahead()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (
       select 1 from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) it
        where it->>'kind' = 'tapas'
     )
     and new.date <= (now() at time zone 'Europe/Copenhagen')::date then
    raise exception 'tapas-dato';
  end if;
  return new;
end $$;

drop trigger if exists trg_tapas_dayahead on orders;
create trigger trg_tapas_dayahead
  before insert on orders
  for each row execute function public.enforce_tapas_dayahead();

-- Kvittering: viser at triggeren er på plads
select tgname as trigger_navn from pg_trigger where tgname = 'trg_tapas_dayahead';
