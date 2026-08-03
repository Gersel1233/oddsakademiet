-- ============================================================
-- SPIIS – RYD TESTDATA (frisk start før personalet tager over)
-- Kør DENNE fil i Supabase → SQL Editor → Run, ÉN gang.
--
-- Den fjerner alt det "løse", der er lavet under test:
--   • alle bookinger (møder + arrangement-forespørgsler)
--   • alle bestillinger (madbestillinger + special-bestillinger fra nyheder)
--   • lukkede/blokerede dage + ferie-perioden (nulstilles, så intet hænger fast)
--
-- Den RØRER IKKE dit rigtige opsæt:
--   ✓ menukort + priser   ✓ åbningstider   ✓ dagens ret / ugeplan
--   ✓ nyheder             ✓ indstillinger  ✓ login
--
-- OBS: sletning kan ikke fortrydes – men det er kun testdata, der ryddes.
-- ============================================================

-- 1) alle bookinger og bestillinger væk
delete from public.bookings;
delete from public.orders;

-- 2) nulstil de "operationelle" dage i config, så ingen dag står lukket
--    med en booking, der ikke findes mere (og sluk ferie-tilstand)
update public.config
set data = data || jsonb_build_object(
      'blockedDates',     '[]'::jsonb,
      'arrangementDates', '[]'::jsonb,
      'orderClosedDates', '[]'::jsonb,
      'closure', jsonb_build_object('active', false, 'from', '', 'reopen', '', 'message', '')
    ),
    updated_at = now()
where id = 1;

-- (VALGFRIT) vil du også fjerne test-nyheder, så fjern -- foran linjen herunder:
-- update public.config set data = data || jsonb_build_object('news', '[]'::jsonb), updated_at = now() where id = 1;

-- ✅ Færdig. Genindlæs admin-appen (træk ned / opdater siden), så er alt blankt.
