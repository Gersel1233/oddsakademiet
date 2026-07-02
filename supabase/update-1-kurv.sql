-- ============================================================
-- SPIIS – opdatering 1: blandede bestillinger (kurv)
-- Kør denne ÉN gang i Supabase → SQL Editor → Run.
-- Kan køres når som helst – den gamle hjemmeside virker stadig,
-- og den nye bruger kurven, så snart den er live.
--
-- Nyt: bestillinger kan indeholde flere retter (items) og et
-- antal personer (persons). Lagertjekket gælder stadig KUN
-- dagens ret og sker stadig atomisk.
-- ============================================================

alter table public.orders add column if not exists items jsonb not null default '[]'::jsonb;
alter table public.orders add column if not exists persons int;

-- qty er nu "antal dagens ret" og må være 0 (ren menukort-bestilling)
alter table public.orders drop constraint if exists orders_qty_check;
alter table public.orders add constraint orders_qty_check check (qty between 0 and 100);

drop function if exists public.place_order(date, text, int, text, text, text, text, text, numeric);

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
