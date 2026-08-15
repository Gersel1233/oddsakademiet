-- ============================================================
-- EGNE BESTILLINGSTIDER PAA EN ENKELT DAG
-- Kør ÉN gang i Supabase -> SQL Editor -> Run.
--
-- Hvorfor: "paa mandag aabner vi foerst 17:30" - saa skal ingen kunne
-- vaelge 16:00 den dag. Normalt gaelder det samme vindue hver dag.
--
-- Denne opdatering indeholder OGSAA reglen fra luk-type.sql, saa den
-- kan koeres alene. Har du allerede koert luk-type.sql, goer det ingen
-- skade at koere denne oveni.
--
-- Rører ikke ved data. Alt andet virker praecis som foer.
-- ============================================================

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

  -- NYT: dagen kan være lukket for KUN den ene måde at spise på.
  -- Fx "på torsdag kan man kun bestille take-away". Køkkenet sætter
  -- det i admin -> Kalender -> tryk på dagen.
  if coalesce(
       jsonb_exists(
         coalesce(v_cfg->'closedTypes'->to_char(p_date, 'YYYY-MM-DD'), '[]'::jsonb),
         case when p_type = 'spise' then 'spise' else 'togo' end),
       false) then
    return jsonb_build_object('ok', false, 'reason', 'type-lukket',
                              'type', case when p_type = 'spise' then 'spise' else 'togo' end);
  end if;

  if coalesce((v_cfg->'closure'->>'active')::boolean, false)
     and coalesce(v_cfg->'closure'->>'reopen', '') <> ''
     and to_char(p_date, 'YYYY-MM-DD') < (v_cfg->'closure'->>'reopen')
     and (coalesce(v_cfg->'closure'->>'from', '') = ''
          or to_char(p_date, 'YYYY-MM-DD') >= (v_cfg->'closure'->>'from')) then
    return jsonb_build_object('ok', false, 'reason', 'lukket');
  end if;

  -- Bestillingsvinduet er FORSKELLIGT pr. type: to-go til kl. 19,
  -- spis her til kl. 20:30. NYT: en enkelt dag kan have sit eget
  -- vindue (fx "mandag aabner vi foerst 17:30"). Er dagens felt tomt,
  -- gaelder den almindelige tid.
  if coalesce(p_time, '') <> '' and (
       p_time < coalesce(
                  nullif(v_cfg->'dayTimes'->to_char(p_date,'YYYY-MM-DD')->>'from', ''),
                  v_cfg->'settings'->>'orderFrom', '16:00')
       or (p_type = 'spise' and p_time > coalesce(
                  nullif(v_cfg->'dayTimes'->to_char(p_date,'YYYY-MM-DD')->>'toDine', ''),
                  v_cfg->'settings'->>'orderToDine', '20:30'))
       or (p_type <> 'spise' and p_time > coalesce(
                  nullif(v_cfg->'dayTimes'->to_char(p_date,'YYYY-MM-DD')->>'toTogo', ''),
                  v_cfg->'settings'->>'orderToTogo', '19:00'))
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

-- Baeltet OG selerne, ogsaa for typerne (uaendret fra luk-type.sql)
create or replace function public.spiis_type_lukket(p_date date, p_type text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    jsonb_exists(
      coalesce((select data->'closedTypes'->to_char(p_date, 'YYYY-MM-DD')
                  from config where id = 1), '[]'::jsonb),
      case when p_type = 'spise' then 'spise' else 'togo' end),
    false)
$$;

create or replace function public.enforce_type_closed()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.spiis_type_lukket(new.date, new.type) then
    raise exception 'type-lukket';
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_type_closed on public.orders;
create trigger trg_orders_type_closed
  before insert on public.orders
  for each row execute function public.enforce_type_closed();

select 'Nu kan en enkelt dag have sine egne bestillingstider. '
    || 'Saet dem i admin -> Kalender -> tryk paa dagen.' as besked;
