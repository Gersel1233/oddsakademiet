-- ============================================================
-- SPIIS – opdatering 10: nyheder på forsiden (med billeder)
-- Kør ÉN gang i Supabase → SQL Editor → Run.
-- (Kræver at opdatering 9 er kørt først – det har du gjort.)
--
-- Opretter et offentligt billed-arkiv ("nyheder"), som admin-appen
-- lægger nyhedsbilleder op i. Alle kan SE billederne (de vises jo
-- på hjemmesiden) – kun chefen kan lægge op og slette.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('nyheder', 'nyheder', true)
on conflict (id) do update set public = true;

drop policy if exists "nyheder kan ses af alle" on storage.objects;
create policy "nyheder kan ses af alle"
  on storage.objects for select
  using (bucket_id = 'nyheder');

drop policy if exists "nyheder upload kun chef" on storage.objects;
create policy "nyheder upload kun chef"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'nyheder' and public.is_admin());

drop policy if exists "nyheder opdater kun chef" on storage.objects;
create policy "nyheder opdater kun chef"
  on storage.objects for update to authenticated
  using (bucket_id = 'nyheder' and public.is_admin());

drop policy if exists "nyheder slet kun chef" on storage.objects;
create policy "nyheder slet kun chef"
  on storage.objects for delete to authenticated
  using (bucket_id = 'nyheder' and public.is_admin());
