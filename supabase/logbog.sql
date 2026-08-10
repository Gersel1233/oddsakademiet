-- ============================================================
-- SPIIS – LOGBOG OVER BESTILLINGER
-- Kør ÉN gang i Supabase → SQL Editor → Run.
--
-- Hvorfor: en rigtig kundebestilling dukkede op i admin og forsvandt
-- igen kort efter. Uden en logbog kan vi ikke se, om den nogensinde
-- blev oprettet, eller hvornår og af hvem den blev slettet.
--
-- Logbogen skriver en linje HVER gang en bestilling oprettes, ændres
-- eller slettes. Den kan ikke ændres eller slettes af appen – heller
-- ikke af personalet. Den koster ingenting og påvirker ikke driften.
-- ============================================================

create table if not exists public.order_log (
  log_id     bigserial primary key,
  hvornaar   timestamptz not null default now(),
  handling   text        not null,   -- oprettet / ændret / slettet
  order_id   uuid,
  kunde      text,
  dato       date,
  klokken    text,
  status     text,
  varer      text,
  af_hvem    text,                   -- indlogget bruger, hvis der er en
  rolle      text,                   -- anon = kunde, authenticated = personale
  hele_raden jsonb
);

create index if not exists order_log_tid on public.order_log (hvornaar desc);

-- ── Skriveren ───────────────────────────────────────────────
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
    (select string_agg((i->>'qty') || '× ' || (i->>'name'), ' + ')
       from jsonb_array_elements(coalesce(r.items, '[]'::jsonb)) i),
    coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email', '(ingen)'),
    coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', current_user),
    to_jsonb(r)
  );
  return null;   -- AFTER-trigger: returværdien betyder ingenting
exception when others then
  -- En logbog må ALDRIG kunne vælte en bestilling. Går skrivningen
  -- galt, lader vi bestillingen gå igennem alligevel.
  return null;
end;
$$;

drop trigger if exists trg_log_orders on public.orders;
create trigger trg_log_orders
  after insert or update or delete on public.orders
  for each row execute function public.log_order_change();

-- ── Kun personalet må læse logbogen. Ingen må slette i den. ──
alter table public.order_log enable row level security;

drop policy if exists order_log_select on public.order_log;
create policy order_log_select on public.order_log
  for select using (public.is_admin());
-- bevidst INGEN insert/update/delete-regler: kun triggeren (security
-- definer) skriver, og så kan hverken app eller personale rette i den.

-- ── Sådan læser du den bagefter ─────────────────────────────
-- Kør denne, når noget er forsvundet:
--
--   select hvornaar at time zone 'Europe/Copenhagen' as tidspunkt,
--          handling, kunde, dato, klokken, varer, af_hvem, rolle
--   from public.order_log
--   order by hvornaar desc
--   limit 50;
--
-- 'oprettet' med rolle 'anon'          = en kunde bestilte
-- 'SLETTET'  med en e-mail i af_hvem   = nogen slettede den fra admin
-- 'SLETTET'  uden e-mail               = slettet direkte i databasen

select 'Logbogen er slået til. Fra nu af gemmes hver eneste oprettelse, '
    || 'ændring og sletning af en bestilling – med tidspunkt og hvem. '
    || 'Næste gang noget forsvinder, kan vi se præcis hvad der skete.' as besked;
