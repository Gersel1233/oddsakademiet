-- ============================================================
-- VALGMULIGHEDER PAA DAGENS RET
-- Kør ÉN gang i Supabase -> SQL Editor -> Run.
--
-- Hvorfor: da bao var dagens ret, kunne man vaelge mellem to slags
-- bolle. Det valg skal foelge med hele vejen - ogsaa ned i logbogen,
-- saa man bagefter kan se HVAD kunden bestilte, ikke bare hvilken ret.
--
-- Selve valget kraever ingen aendring i place_order: det ligger i
-- bestillingens varelinjer og gemmes som det er. Det eneste der skal
-- rettes, er logbogens opsummering, saa den ogsaa skriver valget.
--
-- Rører ikke ved data. Alt andet virker praecis som foer.
-- ============================================================

create or replace function public.log_order_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  h text;
begin
  if (tg_op = 'INSERT') then h := 'oprettet'; r := new;
  elsif (tg_op = 'UPDATE') then h := 'ændret';  r := new;
  else                       h := 'SLETTET';   r := old;
  end if;

  insert into public.order_log
    (handling, order_id, kunde, dato, klokken, status, varer, af_hvem, rolle, hele_raden)
  values (
    h, r.id, r.name, r.date, r.time, r.status,
    -- NYT: har kunden valgt mellem flere udgaver, skrives valget med
    (select string_agg(
              (i->>'qty') || '× ' || (i->>'name')
              || coalesce(' · ' || nullif(i->>'valg', ''), ''),
              ' + ')
       from jsonb_array_elements(coalesce(r.items, '[]'::jsonb)) i),
    coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email', '(ingen)'),
    coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', current_user),
    to_jsonb(r)
  );
  return null;
exception when others then
  -- En logbog må ALDRIG kunne vælte en bestilling.
  return null;
end;
$$;

drop trigger if exists trg_log_orders on public.orders;
create trigger trg_log_orders
  after insert or update or delete on public.orders
  for each row execute function public.log_order_change();

select 'Logbogen skriver nu ogsaa kundens valg (fx hvilken bolle). '
    || 'Selve valget virker med det samme - denne SQL er kun for logbogen.' as besked;
