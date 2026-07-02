-- ============================================================
-- SPIIS – opdatering 3: interne personale-noter på bookinger
-- Kør ÉN gang i Supabase → SQL Editor → Run.
--
-- Chefen kan skrive en intern note på arrangementer/møder
-- (fx "Dæk op til 20 på venstre fløj med servietter og flag").
-- Noten er kun synlig i admin – aldrig for kunder.
-- ============================================================

alter table public.bookings add column if not exists staff_note text not null default '';
