-- ============================================================
-- SPIIS – opdatering 4: push-notifikationer til admin-appen
-- Kør ÉN gang i Supabase → SQL Editor → Run.
--
-- Tabellen gemmer chefernes telefoner (push-abonnementer), så
-- Supabase kan sende besked ved nye bestillinger og bookinger.
-- Kun chefen (login) kan læse/skrive – kunder har ingen adgang.
-- ============================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_all on public.push_subscriptions;
create policy push_all on public.push_subscriptions for all
  using (public.is_admin()) with check (public.is_admin());
