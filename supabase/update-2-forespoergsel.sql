-- ============================================================
-- SPIIS – opdatering 2: arrangement-forespørgsler
-- Kør ÉN gang i Supabase → SQL Editor → Run.
--
-- Arrangement-forespørgsler kan sendes uden fastlagt dato og
-- tidspunkt (det aftales, når I kontakter kunden).
-- ============================================================

alter table public.bookings alter column date drop not null;
alter table public.bookings alter column "time" drop not null;
