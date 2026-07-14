-- ============================================================
-- SPIIS – opdatering 11: bestil en special direkte fra en nyhed
-- Kør ÉN gang i Supabase → SQL Editor → Run.
-- (Kræver at opdatering 9 + 10 er kørt.)
--
-- Når køkkenet gør en nyhed "bestilbar" (fx juleplatter med pris),
-- kan kunden bestille den fra hjemmesiden. Ordren lander i den
-- almindelige bestillings-tabel, så den vises i køreplanen og tælles
-- i kalenderen ligesom alt andet.
-- ============================================================

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

  -- lås config, så max-antal ikke kan overskrides i et kapløb
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
  -- bestil senest (deadline) – baseret på dags dato
  if coalesce(v_news->>'orderBy', '') <> '' and current_date > (v_news->>'orderBy')::date then
    return jsonb_build_object('ok', false, 'reason', 'deadline');
  end if;

  v_title := coalesce(v_news->>'title', 'Nyhed');
  v_price := nullif(v_news->>'price', '')::numeric;

  -- valgfrit max antal portioner: tæl allerede bestilte for netop denne nyhed
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

  -- qty=0 for dagens ret (så det ikke tælles som dagens ret-salg);
  -- selve specialen ligger som en 'nyhed'-vare i items
  insert into orders(date, "time", qty, type, name, phone, note, dish, price, items, persons)
  values (p_date, '', 0, 'togo',
          left(trim(p_name), 120), left(trim(p_phone), 40),
          left(coalesce(p_note, ''), 400), '', null,
          jsonb_build_array(v_item),
          case when p_qty between 1 and 500 then p_qty else null end);

  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.place_news_order to anon, authenticated;
