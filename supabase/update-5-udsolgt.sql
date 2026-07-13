-- ============================================================
-- SPIIS – opdatering 5: udsolgt-markering på menukortet
-- Kør ÉN gang i Supabase → SQL Editor → Run.
--
-- Chefen kan markere en ret som UDSOLGT i admin → Menukort.
-- Denne opdatering lærer databasen at afvise bestillinger med
-- udsolgte varer – også hvis to kunder bestiller samtidig, eller
-- en kunde har siden åben fra før retten blev udsolgt.
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
  v_blocked text;
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

  -- lås config-rækken, så lagertjek + indsættelse sker uden kapløb
  perform 1 from config where id = 1 for update;

  -- afvis varer, chefen har markeret som udsolgt på menukortet
  -- (dagens ret har sit eget lagertjek nedenfor)
  select it->>'name' into v_blocked
  from jsonb_array_elements(v_items) it
  where coalesce(it->>'kind', '') <> 'dagensret'
    and exists (
      select 1
      from config cfg,
           jsonb_array_elements(cfg.data->'menu'->'categories') c,
           jsonb_array_elements(c->'items') i
      where cfg.id = 1
        and coalesce((i->>'soldout')::boolean, false)
        and i->>'name' = it->>'name'
    )
  limit 1;
  if v_blocked is not null then
    return jsonb_build_object('ok', false, 'reason', 'udsolgt', 'item', v_blocked);
  end if;

  if p_qty > 0 then
    select nullif(data->'dagensRet'->to_char(p_date,'YYYY-MM-DD')->>'stock','')::int
      into v_stock from config where id = 1;
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

  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.place_order to anon, authenticated;
