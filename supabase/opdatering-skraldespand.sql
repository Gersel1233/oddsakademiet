-- ============================================================
-- SPIIS – SAMLET OPDATERING: SKRALDESPAND + DE TO DER MANGLEDE
-- Kør ÉN gang i Supabase → SQL Editor → Run.
--
-- Denne ene fil bringer databasen HELT up to date. Den erstatter:
--    · dagens-tider.sql   (egne tider pr. dag + luk kun den ene måde)
--    · valgmuligheder.sql (kundens valg med i logbogen)
--    · luk-type.sql       (er indeholdt i dagens-tider)
-- Har du allerede kørt nogen af dem, gør det ingen skade at køre denne.
--
-- NYT: en slettet bestilling kan hentes tilbage i 30 dage.
-- Sletningen sker stadig med det samme (så portionerne bliver frie
-- igen) – men logbogen gemmer hele bestillingen, og admin kan lægge
-- den tilbage præcis som den var.
--
-- Rører IKKE ved data. Alt eksisterende virker præcis som før.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1) EN GENDANNELSE ER IKKE EN NY BESTILLING
--
-- De tre vagter herunder findes for at forhindre KUNDER i at snige
-- noget igennem: nødbremsen, en lukket spisemåde og samme-dags tapas.
-- De må ikke stå i vejen for at rette en fejl. Derfor har de nu alle
-- den samme lille bagdør, som kun gendan-funktionen kan åbne – og
-- kun inde i sin egen transaktion.
-- ────────────────────────────────────────────────────────────

create or replace function public.spiis_gendanner()
returns boolean
language sql stable as $$
  select coalesce(current_setting('spiis.gendan', true), '') = 'on'
$$;

-- nødbremsen
create or replace function public.enforce_orders_paused()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.spiis_gendanner() then return new; end if;
  if public.spiis_orders_paused() then
    raise exception 'pauset';
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_paused on public.orders;
create trigger trg_orders_paused
  before insert on public.orders
  for each row execute function public.enforce_orders_paused();

-- tapas skal bestilles senest dagen før
create or replace function public.enforce_tapas_dayahead()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.spiis_gendanner() then return new; end if;
  if exists (
       select 1 from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) it
        where it->>'kind' = 'tapas'
     )
     and new.date <= (now() at time zone 'Europe/Copenhagen')::date then
    raise exception 'tapas-dato';
  end if;
  return new;
end $$;

drop trigger if exists trg_tapas_dayahead on public.orders;
create trigger trg_tapas_dayahead
  before insert on public.orders
  for each row execute function public.enforce_tapas_dayahead();

-- ────────────────────────────────────────────────────────────
-- 2) BESTILLINGSREGLEN (fra dagens-tider.sql, uændret)
--    egne tider pr. dag + luk kun take-away ELLER kun spis her
-- ────────────────────────────────────────────────────────────

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

-- ────────────────────────────────────────────────────────────
-- 3) BÆLTET OG SELERNE PÅ SPISEMÅDEN
--    (samme regel som i luk-type.sql – nu med bagdøren til gendan)
-- ────────────────────────────────────────────────────────────

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
  if public.spiis_gendanner() then return new; end if;
  if public.spiis_type_lukket(new.date, new.type) then
    raise exception 'type-lukket';
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_type_closed on public.orders;
create trigger trg_orders_type_closed
  before insert on public.orders
  for each row execute function public.enforce_type_closed();

-- ────────────────────────────────────────────────────────────
-- 4) LOGBOGEN SKRIVER OGSÅ KUNDENS VALG (fra valgmuligheder.sql)
--    Den er samtidig selve skraldespanden: hele bestillingen gemmes
--    i 'hele_raden', så den kan lægges tilbage igen.
-- ────────────────────────────────────────────────────────────

create or replace function public.log_order_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  h text;
begin
  if (tg_op = 'INSERT') then h := 'oprettet'; r := new;
  elsif (tg_op = 'UPDATE') then h := 'ændret';  r := new;
  else                       h := 'SLETTET';   r := old;
  end if;

  insert into public.order_log
    (handling, order_id, kunde, dato, klokken, status, varer, af_hvem, rolle, hele_raden)
  values (
    h, r.id, r.name, r.date, r.time, r.status,
    -- NYT: har kunden valgt mellem flere udgaver, skrives valget med
    (select string_agg(
              (i->>'qty') || '× ' || (i->>'name')
              || coalesce(' · ' || nullif(i->>'valg', ''), ''),
              ' + ')
       from jsonb_array_elements(coalesce(r.items, '[]'::jsonb)) i),
    coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email', '(ingen)'),
    coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', current_user),
    to_jsonb(r)
  );
  return null;
exception when others then
  -- En logbog må ALDRIG kunne vælte en bestilling.
  return null;
end;
$$;

drop trigger if exists trg_log_orders on public.orders;
create trigger trg_log_orders
  after insert or update or delete on public.orders
  for each row execute function public.log_order_change();


-- ────────────────────────────────────────────────────────────
-- 5) SKRALDESPANDEN: LÆG EN SLETTET BESTILLING TILBAGE
--
-- Kun personalet (is_admin) kan gøre det. Bestillingen lægges tilbage
-- præcis som den var – samme id, samme varer, samme tid – og markeres
-- ULÆST, så klokken ringer og ingen overser at den er tilbage.
-- ────────────────────────────────────────────────────────────

create or replace function public.gendan_bestilling(p_row jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_dato date;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'grund', 'ikke-adgang');
  end if;
  if p_row is null or jsonb_typeof(p_row) <> 'object' then
    return jsonb_build_object('ok', false, 'grund', 'tom');
  end if;

  v_id := nullif(p_row->>'id', '')::uuid;
  v_dato := nullif(p_row->>'date', '')::date;
  if v_dato is null then
    return jsonb_build_object('ok', false, 'grund', 'mangler-dato');
  end if;

  -- ligger den der allerede, er der intet at gendanne (to tryk i træk)
  if v_id is not null and exists (select 1 from orders where id = v_id) then
    return jsonb_build_object('ok', true, 'id', v_id, 'grund', 'var-der-allerede');
  end if;

  -- åbn bagdøren for de tre vagter – kun i denne transaktion
  perform set_config('spiis.gendan', 'on', true);

  insert into orders (id, date, "time", qty, type, name, phone, note, dish,
                      price, items, persons, status, read, created_at)
  values (
    coalesce(v_id, gen_random_uuid()),
    v_dato,
    coalesce(p_row->>'time', ''),
    least(greatest(coalesce(nullif(p_row->>'qty', '')::int, 0), 0), 100),
    coalesce(nullif(p_row->>'type', ''), 'togo'),
    left(coalesce(nullif(p_row->>'name', ''), 'Uden navn'), 120),
    left(coalesce(p_row->>'phone', ''), 40),
    left(coalesce(p_row->>'note', ''), 400),
    left(coalesce(p_row->>'dish', ''), 200),
    nullif(p_row->>'price', '')::numeric,
    case when jsonb_typeof(p_row->'items') = 'array' then p_row->'items' else '[]'::jsonb end,
    nullif(p_row->>'persons', '')::int,
    coalesce(nullif(p_row->>'status', ''), 'ny'),
    false,
    coalesce(nullif(p_row->>'created_at', '')::timestamptz, now())
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
exception when others then
  -- hellere et ærligt nej end en halv gendannelse
  return jsonb_build_object('ok', false, 'grund', 'fejl', 'detalje', sqlerrm);
end $$;

-- Postgres giver som udgangspunkt alle lov til at kalde en ny funktion.
-- Vi tager den ret fra ALLE først, og giver den kun til dem der er
-- logget ind. Inde i funktionen tjekkes der oveni, at det er chefen.
revoke execute on function public.gendan_bestilling(jsonb) from public;
grant execute on function public.gendan_bestilling(jsonb) to authenticated;

-- ── Kvittering ──────────────────────────────────────────────
select 'Databasen er helt up to date. '
    || 'Egne tider pr. dag ✓  ·  luk kun den ene spisemåde ✓  ·  '
    || 'kundens valg i logbogen ✓  ·  skraldespand i 30 dage ✓' as besked;
