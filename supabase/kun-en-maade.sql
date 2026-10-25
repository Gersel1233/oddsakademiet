-- ============================================================
-- KUN TAKE-AWAY / KUN SPIS HER / BEGGE DELE – DATABASENS VÆRN
-- Kør ÉN gang i Supabase -> SQL Editor -> Run.  (25/10)
--
-- I admin -> Åbningstider står nu "Hvad kan kunderne bestille?" med
-- tre knapper. Hjemmesiden følger valget med det samme. Denne fil er
-- et ekstra sikkerhedsnet: en fane, der har stået åben, FØR I skiftede,
-- kan ikke sende den lukkede måde ind – databasen siger selv nej, og
-- kunden får at vide, hvad der gælder nu.
--
-- Hjemmesiden virker også uden filen. Rører ikke ved data.
-- Kun bestillinger fra hjemmesiden (client_ref 'w-...') – aldrig dem,
-- I selv taster ind i admin.
-- ============================================================

create or replace function public.spiis_kun_en_maade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v text;
begin
  if coalesce(new.client_ref, '') not like 'w-%' then
    return new;
  end if;
  select data->'settings'->>'orderTypes' into v from config where id = 1;
  -- 'togo' = kun take-away, 'spise' = kun spis her, alt andet = begge
  if v = 'togo' and new.type = 'spise' then
    raise exception 'type-lukket: spise';
  end if;
  if v = 'spise' and new.type = 'togo' then
    raise exception 'type-lukket: togo';
  end if;
  return new;
end;
$$;

revoke all on function public.spiis_kun_en_maade() from public, anon, authenticated;

drop trigger if exists spiis_kun_en_maade on public.orders;
create trigger spiis_kun_en_maade
  before insert on public.orders
  for each row execute function public.spiis_kun_en_maade();

-- Der skal stå "true" og jeres valg (tomt = begge dele):
select exists (select 1 from pg_trigger where tgname = 'spiis_kun_en_maade') as "værnet er sat på",
       coalesce((select data->'settings'->>'orderTypes' from config where id = 1), 'begge') as "valget nu";

-- ── FJERN IGEN ────────────────────────────────────────────────
-- drop trigger if exists spiis_kun_en_maade on public.orders;
