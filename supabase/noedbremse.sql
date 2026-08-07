-- ============================================================
-- NØDBREMSE: chefen kan slukke HELT for online bestillinger
-- Køres ÉN gang i Supabase → SQL Editor → Run.
--
-- Efter denne opdatering afviser databasen selv alle bestillinger,
-- når "Sluk for online bestilling" er slået til i admin → Åbningstider.
-- Rører ikke ved data – kun reglen. Alt andet virker som før.
-- ============================================================

-- (indholdet er identisk med place_order i spiis-opdater-alt.sql,
--  men her isoleret så du kan køre kun denne ændring)
create or replace function public.spiis_orders_paused()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((data->'settings'->>'ordersPaused')::boolean, false)
    from config where id = 1
$$;

-- Trigger: uanset hvordan en bestilling kommer ind, afvises den når
-- nødbremsen er trukket.
create or replace function public.enforce_orders_paused()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.spiis_orders_paused() then
    raise exception 'pauset';
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_paused on orders;
create trigger trg_orders_paused
  before insert on orders
  for each row execute function public.enforce_orders_paused();

-- Kvittering
select tgname as trigger_navn from pg_trigger where tgname = 'trg_orders_paused';
