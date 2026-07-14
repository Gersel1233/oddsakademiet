-- ============================================================
-- SPIIS – opdatering 12: fast bestillingsvindue + ferie/luk-periode
-- Kør ÉN gang i Supabase → SQL Editor → Run.
-- (Kræver at opdatering 9–11 er kørt.)
--
-- 1) Bestillinger kan kun vælges i ét vindue (16:00–21:00, kan
--    ændres i admin → Åbningstider).
-- 2) Ferie/luk-periode: madbestilling lukkes i en periode, mens
--    booking, forespørgsler og kontakt stadig er åbne.
-- ============================================================

create or replace function public.place_order(
  p_date date, p_time text, p_qty int, p_type text,
  p_name text, p_phone text, p_note text, p_dish text, p_price numeric,
  p_items jsonb default '[]'::jsonb, p_persons int default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_stock int;
  v_sold int;
  v_remaining int;
  v_cfg jsonb;
  v_ci int;
  v_ii int;
  v_item jsonb;
  v_left int;
  v_req int;
  v_changed boolean := false;
  r record;
  v_items jsonb := coalesce(p_items, '[]'::jsonb);
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

  select data into v_cfg from config where id = 1 for update;

  if coalesce(v_cfg->'blockedDates' ? to_char(p_date, 'YYYY-MM-DD'), false)
     or coalesce(v_cfg->'orderClosedDates' ? to_char(p_date, 'YYYY-MM-DD'), false) then
    return jsonb_build_object('ok', false, 'reason', 'lukket');
  end if;

  -- ferie/luk-periode (booking + kontakt er stadig åbne)
  if coalesce((v_cfg->'closure'->>'active')::boolean, false)
     and coalesce(v_cfg->'closure'->>'reopen', '') <> ''
     and to_char(p_date, 'YYYY-MM-DD') < (v_cfg->'closure'->>'reopen')
     and (coalesce(v_cfg->'closure'->>'from', '') = ''
          or to_char(p_date, 'YYYY-MM-DD') >= (v_cfg->'closure'->>'from')) then
    return jsonb_build_object('ok', false, 'reason', 'lukket');
  end if;

  -- bestillingsvindue (16:00–21:00, kan ændres i admin)
  if coalesce(p_time, '') <> '' and (
       p_time < coalesce(v_cfg->'settings'->>'orderFrom', '16:00')
       or p_time > coalesce(v_cfg->'settings'->>'orderTo', '21:00')
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
    if v_item is null then
      continue;
    end if;
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

  if p_qty > 0 then
    v_stock := nullif(v_cfg->'dagensRet'->to_char(p_date,'YYYY-MM-DD')->>'stock','')::int;
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


-- nyheds-bestillinger respekterer også ferie-perioden
create or replace function public.place_news_order(
  p_news_id text, p_date date, p_qty int,
  p_name text, p_phone text, p_note text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cfg jsonb;
  v_news jsonb;
  v_max int;
  v_sold int;
  v_price numeric;
  v_title text;
  v_item jsonb;
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
  where value->>'id' = p_news_id
  limit 1;

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

  v_item := jsonb_build_object(
    'name', v_title, 'qty', p_qty, 'kind', 'nyhed',
    'price', v_price, 'news_id', p_news_id
  );

  insert into orders(date, "time", qty, type, name, phone, note, dish, price, items, persons)
  values (p_date, '', 0, 'togo',
          left(trim(p_name), 120), left(trim(p_phone), 40),
          left(coalesce(p_note, ''), 400), '', null,
          jsonb_build_array(v_item),
          case when p_qty between 1 and 500 then p_qty else null end);

  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.place_news_order to anon, authenticated;
