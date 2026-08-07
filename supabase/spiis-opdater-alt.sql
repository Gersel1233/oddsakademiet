-- ============================================================
-- SPIIS – ALT-I-ÉN database-opdatering
-- Kør DENNE ENE fil i Supabase → SQL Editor → Run.
--
-- Den sætter alt det nyeste op på én gang:
--   • Lyn-opdateringer (realtime), så appen fanger nye bestillinger straks
--   • Billed-arkiv til nyheder
--   • Bestil-special-fra-nyhed
--   • Fast bestillingsvindue (16:00–21:00) + ferie/luk-periode
--
-- 100% sikker at køre igen – intet slettes, ingen data røres.
-- (Erstatter de tidligere filer 9, 10, 11 og 12 – du behøver kun denne.)
-- ============================================================

-- 1) fluebenet på arrangementer (gør intet, hvis det allerede findes)
alter table public.bookings add column if not exists block_orders boolean not null default true;

-- 2) meld tabellerne til realtime, så admin får besked med det samme
do $$
begin
  begin alter publication supabase_realtime add table public.orders; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.bookings; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.config; exception when duplicate_object then null; end;
end $$;

-- 3) offentligt billed-arkiv til nyheder (kun chefen kan lægge op / slette)
insert into storage.buckets (id, name, public)
values ('nyheder', 'nyheder', true)
on conflict (id) do update set public = true;

drop policy if exists "nyheder kan ses af alle" on storage.objects;
create policy "nyheder kan ses af alle"
  on storage.objects for select using (bucket_id = 'nyheder');

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

-- 4) bestilling af dagens ret / menukort – med bestillingsvindue + ferie
create or replace function public.place_order(
  p_date date, p_time text, p_qty int, p_type text,
  p_name text, p_phone text, p_note text, p_dish text, p_price numeric,
  p_items jsonb default '[]'::jsonb, p_persons int default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_stock int; v_sold int; v_remaining int; v_cfg jsonb;
  v_ci int; v_ii int; v_item jsonb; v_left int; v_req int;
  v_changed boolean := false; r record;
  v_items jsonb := coalesce(p_items, '[]'::jsonb);
  v_dr jsonb; v_dish jsonb;
begin
  if p_qty is null or p_qty < 0 or p_qty > 100 then
    return jsonb_build_object('ok', false, 'remaining', 0);
  end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 60 then
    return jsonb_build_object('ok', false, 'remaining', 0);
  end if;
  if p_qty = 0 and jsonb_array_length(v_items) = 0 then
    return jsonb_build_object('ok', false, 'remaining', 0);
  end if;
  if coalesce(trim(p_name),'') = '' or coalesce(trim(p_phone),'') = '' then
    return jsonb_build_object('ok', false, 'remaining', 0);
  end if;

  -- datoen må ikke være passeret (dansk tid) …
  if p_date is null or p_date < (now() at time zone 'Europe/Copenhagen')::date then
    return jsonb_build_object('ok', false, 'reason', 'dato');
  end if;
  -- … og til i dag skal tiden være mindst 20 min. ude i fremtiden
  if coalesce(p_time, '') ~ '^[0-2][0-9]:[0-5][0-9]$'
     and (p_date + p_time::time) < ((now() at time zone 'Europe/Copenhagen') + interval '20 minutes') then
    return jsonb_build_object('ok', false, 'reason', 'forbi');
  end if;

  select data into v_cfg from config where id = 1 for update;

  -- chefens nødbremse: online bestilling slukket helt
  if coalesce((v_cfg->'settings'->>'ordersPaused')::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', 'pauset');
  end if;

  if coalesce(v_cfg->'blockedDates' ? to_char(p_date, 'YYYY-MM-DD'), false)
     or coalesce(v_cfg->'orderClosedDates' ? to_char(p_date, 'YYYY-MM-DD'), false) then
    return jsonb_build_object('ok', false, 'reason', 'lukket');
  end if;

  if coalesce((v_cfg->'closure'->>'active')::boolean, false)
     and coalesce(v_cfg->'closure'->>'reopen', '') <> ''
     and to_char(p_date, 'YYYY-MM-DD') < (v_cfg->'closure'->>'reopen')
     and (coalesce(v_cfg->'closure'->>'from', '') = ''
          or to_char(p_date, 'YYYY-MM-DD') >= (v_cfg->'closure'->>'from')) then
    return jsonb_build_object('ok', false, 'reason', 'lukket');
  end if;

  -- bestillingsvinduet er FORSKELLIGT pr. type: to-go til kl. 19, spis her til kl. 20:30
  if coalesce(p_time, '') <> '' and (
       p_time < coalesce(v_cfg->'settings'->>'orderFrom', '16:00')
       or (p_type = 'spise'  and p_time > coalesce(v_cfg->'settings'->>'orderToDine', '20:30'))
       or (p_type <> 'spise' and p_time > coalesce(v_cfg->'settings'->>'orderToTogo', '19:00'))
     ) then
    return jsonb_build_object('ok', false, 'reason', 'tid');
  end if;

  for r in select value as v from jsonb_array_elements(v_items)
           where coalesce(value->>'kind', '') <> 'dagensret' loop
    v_item := null;
    select c.ord::int - 1, i.ord::int - 1, i.val
      into v_ci, v_ii, v_item
      from jsonb_array_elements(v_cfg->'menu'->'categories') with ordinality c(val, ord),
           jsonb_array_elements(c.val->'items') with ordinality i(val, ord)
     where i.val->>'name' = r.v->>'name'
     limit 1;
    if v_item is null then continue; end if;
    if coalesce((v_item->>'soldout')::boolean, false) then
      return jsonb_build_object('ok', false, 'reason', 'udsolgt', 'item', r.v->>'name');
    end if;
    if v_item->>'left' is not null then
      v_left := (v_item->>'left')::int;
      v_req := coalesce((r.v->>'qty')::int, 0);
      if v_req > v_left then
        return jsonb_build_object('ok', false, 'reason', 'antal',
                                  'item', r.v->>'name', 'remaining', greatest(v_left, 0));
      end if;
      if v_left - v_req <= 0 then
        v_item := jsonb_set(jsonb_set(v_item, '{soldout}', 'true'::jsonb), '{left}', 'null'::jsonb);
      else
        v_item := jsonb_set(v_item, '{left}', to_jsonb(v_left - v_req));
      end if;
      v_cfg := jsonb_set(v_cfg, array['menu', 'categories', v_ci::text, 'items', v_ii::text], v_item);
      v_changed := true;
    end if;
  end loop;

  -- dagens ret(ter): udsolgt-flag + pr.-ret-lager (understøtter FLERE retter pr. dag)
  v_dr := v_cfg->'dagensRet'->to_char(p_date, 'YYYY-MM-DD');
  if v_dr is not null and jsonb_typeof(v_dr) = 'object' then
    v_dr := jsonb_build_array(v_dr);
  end if;
  for r in select value as v from jsonb_array_elements(v_items)
           where coalesce(value->>'kind', '') = 'dagensret' loop
    select value into v_dish from jsonb_array_elements(coalesce(v_dr, '[]'::jsonb))
     where value->>'title' = r.v->>'name' limit 1;
    if v_dish is null or coalesce((v_dish->>'soldout')::boolean, false) then
      return jsonb_build_object('ok', false, 'reason', 'udsolgt', 'item', r.v->>'name');
    end if;
    if nullif(v_dish->>'stock', '') is not null then
      -- solgt af netop denne ret: items-linjer + ældre ordrer uden items-linje
      select coalesce(sum((i->>'qty')::int), 0) into v_sold
        from orders o, lateral jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) i
       where o.date = p_date and i->>'kind' = 'dagensret' and i->>'name' = r.v->>'name';
      select v_sold + coalesce(sum(o.qty), 0) into v_sold
        from orders o
       where o.date = p_date and o.qty > 0 and o.dish = r.v->>'name'
         and not exists (select 1 from jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) i2
                          where i2->>'kind' = 'dagensret');
      v_remaining := greatest((v_dish->>'stock')::int - v_sold, 0);
      v_req := coalesce((r.v->>'qty')::int, 0);
      if v_req > v_remaining then
        return jsonb_build_object('ok', false, 'reason', 'antal',
                                  'item', r.v->>'name', 'remaining', v_remaining);
      end if;
    end if;
  end loop;
  -- ældre klienter: qty uden items-linje → dag-total mod første rets antal
  if p_qty > 0 and not exists (select 1 from jsonb_array_elements(v_items) i
                                where coalesce(i.value->>'kind', '') = 'dagensret') then
    if coalesce((v_dr->0->>'soldout')::boolean, false) then
      return jsonb_build_object('ok', false, 'remaining', 0);
    end if;
    v_stock := nullif(coalesce(v_dr->0->>'stock', ''), '')::int;
    if v_stock is not null then
      select coalesce(sum(qty),0) into v_sold from orders where date = p_date;
      v_remaining := greatest(v_stock - v_sold, 0);
      if p_qty > v_remaining then
        return jsonb_build_object('ok', false, 'remaining', v_remaining);
      end if;
    end if;
  end if;

  insert into orders(date, "time", qty, type, name, phone, note, dish, price, items, persons)
  values (p_date, p_time, p_qty, p_type,
          left(trim(p_name), 120), left(trim(p_phone), 40),
          left(coalesce(p_note,''), 400), left(coalesce(p_dish,''), 200), p_price,
          v_items,
          case when p_persons between 1 and 500 then p_persons else null end);

  if v_changed then
    update config set data = v_cfg, updated_at = now() where id = 1;
  end if;

  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.place_order to anon, authenticated;

-- 5) bestil en special direkte fra en nyhed (respekterer også ferie)
create or replace function public.place_news_order(
  p_news_id text, p_date date, p_qty int,
  p_name text, p_phone text, p_note text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cfg jsonb; v_news jsonb; v_max int; v_sold int; v_price numeric; v_title text; v_item jsonb;
begin
  if p_qty is null or p_qty < 1 or p_qty > 100 then
    return jsonb_build_object('ok', false, 'reason', 'antal');
  end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_phone), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'mangler');
  end if;
  if p_date is null or p_date < current_date then
    return jsonb_build_object('ok', false, 'reason', 'dato');
  end if;

  select data into v_cfg from config where id = 1 for update;

  select value into v_news
  from jsonb_array_elements(coalesce(v_cfg->'news', '[]'::jsonb))
  where value->>'id' = p_news_id limit 1;

  if v_news is null then return jsonb_build_object('ok', false, 'reason', 'findes-ikke'); end if;
  if coalesce((v_news->>'orderable')::boolean, false) = false then
    return jsonb_build_object('ok', false, 'reason', 'ikke-bestilbar');
  end if;
  if coalesce(v_news->>'active', 'true') = 'false' then
    return jsonb_build_object('ok', false, 'reason', 'ikke-aktiv');
  end if;
  if coalesce(v_news->>'orderBy', '') <> '' and current_date > (v_news->>'orderBy')::date then
    return jsonb_build_object('ok', false, 'reason', 'deadline');
  end if;
  if coalesce((v_cfg->'closure'->>'active')::boolean, false)
     and coalesce(v_cfg->'closure'->>'reopen', '') <> ''
     and to_char(p_date, 'YYYY-MM-DD') < (v_cfg->'closure'->>'reopen')
     and (coalesce(v_cfg->'closure'->>'from', '') = ''
          or to_char(p_date, 'YYYY-MM-DD') >= (v_cfg->'closure'->>'from')) then
    return jsonb_build_object('ok', false, 'reason', 'lukket');
  end if;

  v_title := coalesce(v_news->>'title', 'Nyhed');
  v_price := nullif(v_news->>'price', '')::numeric;

  if coalesce(v_news->>'orderMax', '') <> '' then
    v_max := (v_news->>'orderMax')::int;
    select coalesce(sum((i->>'qty')::int), 0) into v_sold
    from orders o, lateral jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) i
    where i->>'news_id' = p_news_id;
    if v_sold + p_qty > v_max then
      return jsonb_build_object('ok', false, 'reason', 'antal', 'remaining', greatest(v_max - v_sold, 0));
    end if;
  end if;

  v_item := jsonb_build_object('name', v_title, 'qty', p_qty, 'kind', 'nyhed', 'price', v_price, 'news_id', p_news_id);

  insert into orders(date, "time", qty, type, name, phone, note, dish, price, items, persons)
  values (p_date, '', 0, 'togo',
          left(trim(p_name), 120), left(trim(p_phone), 40),
          left(coalesce(p_note, ''), 400), '', null,
          jsonb_build_array(v_item),
          case when p_qty between 1 and 500 then p_qty else null end);

  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.place_news_order to anon, authenticated;

-- 6) pr.-ret-salgstal – så hjemmesiden kan vise "kun X tilbage" pr. ret,
--    når der er FLERE dagens retter på samme dag
create or replace function public.get_sold_dishes()
returns table("date" date, name text, sold bigint)
language sql security definer set search_path = public as $$
  select t.date, t.name, sum(t.sold)::bigint as sold from (
    select o.date, i->>'name' as name, coalesce(sum((i->>'qty')::int), 0)::bigint as sold
      from orders o, lateral jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) i
     where i->>'kind' = 'dagensret' and o.date >= current_date - 1
     group by o.date, i->>'name'
    union all
    select o.date, o.dish as name, sum(o.qty)::bigint as sold
      from orders o
     where o.qty > 0 and coalesce(o.dish, '') <> '' and o.date >= current_date - 1
       and not exists (select 1 from jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) i2
                        where i2->>'kind' = 'dagensret')
     group by o.date, o.dish
  ) t group by t.date, t.name;
$$;
grant execute on function public.get_sold_dishes to anon, authenticated;

-- ✅ Færdig. Ser du ingen rød fejl, er alt sat op.

-- ============================================================
-- SPIIS TAPAS-REGLEN (tilføjet august 2026): tapas skal ALTID
-- bestilles senest dagen før – håndhævet med trigger i databasen.
-- ============================================================
create or replace function public.enforce_tapas_dayahead()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (
       select 1 from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) it
        where it->>'kind' = 'tapas'
     )
     and new.date <= (now() at time zone 'Europe/Copenhagen')::date then
    raise exception 'tapas-dato';
  end if;
  return new;
end $$;

drop trigger if exists trg_tapas_dayahead on orders;
create trigger trg_tapas_dayahead
  before insert on orders
  for each row execute function public.enforce_tapas_dayahead();

-- ============================================================
-- NØDBREMSE (august 2026): slukker HELT for online bestillinger,
-- når chefen slår den til i admin → Åbningstider.
-- ============================================================
create or replace function public.spiis_orders_paused()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((data->'settings'->>'ordersPaused')::boolean, false)
    from config where id = 1
$$;

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
