-- ============================================================
-- SPIIS – SMS TIL KUNDEN: bekræftelse + påmindelse 30 min før
-- Kør ÉN gang i Supabase → SQL Editor → Run, EFTER at
-- Edge Function'en send-sms er lagt op (se SMS-OPSAETNING.md).
--
-- Rører IKKE ved eksisterende data. Bestillinger virker præcis som før:
-- sms'en sendes bagefter, i baggrunden, og kan aldrig stoppe en bestilling.
-- Kun bestillinger fra hjemmesiden (client_ref 'w-…') får sms – ikke dem,
-- køkkenet selv taster ind i admin.
-- ============================================================

-- 0) den hemmelige nøgle, som databasen viser frem for send-sms.
--    Erstat teksten med den SAMME lange tilfældige tekst, som står i
--    Edge Functions → Secrets → SMS_SECRET. Kør kun denne linje én gang.
-- select vault.create_secret('ERSTAT-MED-DIN-LANGE-TILFAELDIGE-TEKST', 'spiis_sms_secret');

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- 1) to felter på bestillingen: hvornår fik kunden sms'erne
alter table public.orders add column if not exists sms_bekraeftet_at timestamptz;
alter table public.orders add column if not exists sms_paamindet_at timestamptz;

-- 2) kald send-sms
create or replace function public.spiis_sms_kald(krop jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hemmelig text;
begin
  select decrypted_secret into hemmelig from vault.decrypted_secrets where name = 'spiis_sms_secret' limit 1;
  if hemmelig is null then return; end if;
  perform net.http_post(
    url := 'https://jhdlxexgrwvuoqetcgbt.supabase.co/functions/v1/send-sms',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-spiis-secret', hemmelig),
    body := krop
  );
end;
$$;
revoke all on function public.spiis_sms_kald(jsonb) from public, anon, authenticated;

-- 3) ny bestilling fra hjemmesiden → bekræftelse med det samme
create or replace function public.spiis_sms_ny_ordre()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.client_ref, '') like 'w-%' then
    perform public.spiis_sms_kald(jsonb_build_object('mode', 'bekraeft', 'id', new.id));
  end if;
  return new;
exception when others then
  return new; -- en sms må aldrig stoppe en bestilling
end;
$$;

drop trigger if exists spiis_sms_ny_ordre on public.orders;
create trigger spiis_sms_ny_ordre
  after insert on public.orders
  for each row execute function public.spiis_sms_ny_ordre();

-- 4) hvert 5. minut: send påmindelser til dem, der skal have mad om ca. 30 min
select cron.unschedule(jobid) from cron.job where jobname = 'spiis-sms-paamind';
select cron.schedule('spiis-sms-paamind', '*/5 * * * *',
  $$ select public.spiis_sms_kald('{"mode":"paamind"}'::jsonb) $$);

-- ── SLUK IGEN (hvis det nogensinde skal) ──────────────────────
-- select cron.unschedule('spiis-sms-paamind');
-- drop trigger if exists spiis_sms_ny_ordre on public.orders;
-- (eller bare sæt SMS_AKTIV til "nej" under Edge Functions → Secrets)
