-- ============================================================
-- SPIIS – opdatering 8: små arrangementer kan holde åbent
-- Kør ÉN gang i Supabase → SQL Editor → Run.
-- (Indeholder ALT fra opdatering 5, 6 og 7 – kør bare denne éne,
--  uanset hvilke af de andre du har nået at køre.)
--
-- Nyt flueben på arrangementer: "Luk for almindelige
-- madbestillinger denne dag". Slået TIL som standard (store fester),
-- men chefen fjerner det ved små arrangementer – fx et badminton-
-- arrangement – hvor Spiis holder åbent som normalt.
-- ============================================================

-- fluebenet gemmes på selve arrangementet
alter table public.bookings add column if not exists block_orders boolean not null default true;

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
  -- der skal bestilles NOGET
  if p_qty = 0 and jsonb_array_length(v_items) = 0 then
    return jsonb_build_object('ok', false, 'remaining', 0);
  end if;
  if coalesce(trim(p_name),'') = '' or coalesce(trim(p_phone),'') = '' then
    return jsonb_build_object('ok', false, 'remaining', 0);
  end if;

  -- lås config-rækken, så lagertjek + nedtælling + indsættelse sker uden kapløb
  select data into v_cfg from config where id = 1 for update;

  -- manuelt lukkede dage – og arrangement-dage hvor chefen har valgt at
  -- lukke for madbestillinger – tager ikke imod bestillinger
  if coalesce(v_cfg->'blockedDates' ? to_char(p_date, 'YYYY-MM-DD'), false)
     or coalesce(v_cfg->'orderClosedDates' ? to_char(p_date, 'YYYY-MM-DD'), false) then
    return jsonb_build_object('ok', false, 'reason', 'lukket');
  end if;

  -- menukort-varer: afvis udsolgte, håndhæv "få tilbage"-antal og tæl ned.
  -- Rammer antallet 0, markeres retten automatisk som udsolgt.
  -- (dagens ret har sit eget lagertjek nedenfor)
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
      continue; -- fx dagens ekstra retter, der ikke står i kategorierne
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

  -- gem de nedtalte "få tilbage"-antal (og evt. automatiske udsolgt-markeringer)
  if v_changed then
    update config set data = v_cfg, updated_at = now() where id = 1;
  end if;

  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.place_order to anon, authenticated;
