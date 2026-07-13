-- ============================================================
-- SPIIS – database-opsætning
-- Kør denne fil ÉN gang i Supabase: SQL Editor → New query →
-- indsæt det hele → Run. Den kan køres igen uden problemer.
--
-- Chefens login-e-mail er sat til spiis.bestilling@gmail.com
-- (ret i is_admin() herunder, hvis den skal være en anden).
-- ============================================================

create extension if not exists pgcrypto;

-- Hvem er chefen? Kun denne e-mail kan se/ændre data i admin.
create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce(auth.jwt()->>'email','') = 'spiis.bestilling@gmail.com'
$$;

-- ---------- tabeller ----------
create table if not exists public.config (
  id int primary key check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  "time" text not null,
  qty int not null check (qty between 0 and 100), /* antal dagens ret (0 = kun menukort) */
  type text not null default 'togo',
  name text not null,
  phone text not null,
  note text not null default '',
  dish text not null default '',
  price numeric,
  items jsonb not null default '[]'::jsonb, /* hele kurven: [{name, qty, price, kind}] */
  persons int,
  status text not null default 'ny',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'arrangement',
  subject text not null,
  descr text not null default '',
  date date,        /* arrangement-forespørgsler kan mangle dato */
  "time" text,
  name text not null,
  phone text not null,
  email text not null default '',
  staff_note text not null default '', /* intern note – kun synlig i admin */
  status text not null default 'ny',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.notes (
  date date primary key,
  text text not null default ''
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- ---------- adgangsregler (RLS) ----------
alter table public.config enable row level security;
alter table public.orders enable row level security;
alter table public.bookings enable row level security;
alter table public.notes enable row level security;

-- config (menu, åbningstider, dagens ret): alle kan læse, kun chefen kan ændre
drop policy if exists config_select on public.config;
create policy config_select on public.config for select using (true);
drop policy if exists config_update on public.config;
create policy config_update on public.config for update
  using (public.is_admin()) with check (public.is_admin());

-- bestillinger: oprettes KUN via place_order-funktionen; kun chefen kan læse/ændre/slette
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders for select using (public.is_admin());
drop policy if exists orders_update on public.orders;
create policy orders_update on public.orders for update
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists orders_delete on public.orders;
create policy orders_delete on public.orders for delete using (public.is_admin());

-- bookinger: alle kan oprette, kun chefen kan læse/ændre/slette
drop policy if exists bookings_insert on public.bookings;
create policy bookings_insert on public.bookings for insert with check (true);
drop policy if exists bookings_select on public.bookings;
create policy bookings_select on public.bookings for select using (public.is_admin());
drop policy if exists bookings_update on public.bookings;
create policy bookings_update on public.bookings for update
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists bookings_delete on public.bookings;
create policy bookings_delete on public.bookings for delete using (public.is_admin());

-- chefens dagsnoter: kun chefen
drop policy if exists notes_all on public.notes;
create policy notes_all on public.notes for all
  using (public.is_admin()) with check (public.is_admin());

-- push-abonnementer (notifikationer i admin-appen): kun chefen
alter table public.push_subscriptions enable row level security;
drop policy if exists push_all on public.push_subscriptions;
create policy push_all on public.push_subscriptions for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------- funktioner ----------
-- Placér en bestilling med atomisk lagertjek, så to kunder ikke
-- kan snuppe de sidste portioner samtidig.
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

  -- dage med aftalt arrangement eller manuelt lukkede dage tager ikke imod bestillinger
  if coalesce(v_cfg->'blockedDates' ? to_char(p_date, 'YYYY-MM-DD'), false)
     or coalesce(v_cfg->'arrangementDates' ? to_char(p_date, 'YYYY-MM-DD'), false) then
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

-- Solgte kuverter pr. dag (kun tal – ingen navne/numre), så hjemmesiden
-- kan vise "X portioner tilbage" uden adgang til selve bestillingerne.
create or replace function public.get_sold() returns table(date date, sold bigint)
language sql stable security definer set search_path = public as $$
  select date, sum(qty)::bigint from orders
  where date >= current_date - 1
  group by date
$$;

grant execute on function public.get_sold to anon, authenticated;

-- ---------- startindhold (menu, åbningstider, kontakt) ----------
insert into public.config (id, data) values (1, $json$
{
  "settings": {
    "name": "Spiis",
    "tagline": "Velsmag og kvalitet i hver en bid – nemt, hurtigt og altid en fornøjelse!",
    "address": "Karlslunde Idrætsforening, Kongens Enge 42, 2690 Karlslunde",
    "phone": "93 99 58 58",
    "email": "spiis.bestilling@gmail.com",
    "kitchenClose": "20:30"
  },
  "hours": [
    { "open": "16:00", "close": "22:00", "closed": false },
    { "open": "16:00", "close": "22:00", "closed": false },
    { "open": "16:00", "close": "22:00", "closed": false },
    { "open": "16:00", "close": "22:30", "closed": false },
    { "open": "16:00", "close": "22:00", "closed": false },
    { "open": "16:00", "close": "22:00", "closed": false },
    { "open": "16:00", "close": "22:00", "closed": false }
  ],
  "dagensRet": {},
  "blockedDates": [],
  "menu": {
    "weekly": [[], [], [], [], [], [], []],
    "categories": [
      { "id": "salater", "name": "Salater", "availability": "hverdage", "items": [
        { "name": "Cæsar salat", "desc": "", "price": null },
        { "name": "Vegetarsalat", "desc": "", "price": null }
      ]},
      { "id": "retter", "name": "Retter", "availability": "hverdage", "items": [
        { "name": "Spiis Burger", "desc": "Med to bøffer – i alt 250 g. Fås også som menu med sodavand, pommes og dip.", "price": null },
        { "name": "Børneburger", "desc": "Som Spiis Burgeren, bare med én bøf på 125 g. Fås også som menu med sodavand, pommes og dip.", "price": null },
        { "name": "Nachos med kylling", "desc": "", "price": null },
        { "name": "Pasta bolognese", "desc": "", "price": null }
      ]},
      { "id": "friture", "name": "Friture", "availability": "alle", "items": [
        { "name": "Nuggets med pommes", "desc": "", "price": null },
        { "name": "Pommes frites", "desc": "Med eller uden dip.", "price": null },
        { "name": "Chili cheese tops", "desc": "", "price": null },
        { "name": "Dip", "desc": "Ketchup, mayo, remoulade eller burgerdressing.", "price": null }
      ]},
      { "id": "andet", "name": "Andet", "availability": "alle", "items": [
        { "name": "Panini", "desc": "Med skinke og ost eller kylling og pesto.", "price": null },
        { "name": "Stort hjemmelavet surdejsbrød", "desc": "", "price": 40 },
        { "name": "Halvt hjemmelavet surdejsbrød", "desc": "", "price": 25 }
      ]},
      { "id": "drikke", "name": "Drikkevarer", "availability": "alle", "items": [
        { "name": "Sodavand", "desc": "Stort sortiment.", "price": null },
        { "name": "Capri-Sun & juicebrik", "desc": "", "price": null },
        { "name": "Fadøl", "desc": "Rød Tuborg, Classic, Grøn Tuborg, Grimbergen og 1664 Blanc.", "price": null },
        { "name": "Breezer & Somersby", "desc": "", "price": null },
        { "name": "Alkoholfri øl", "desc": "", "price": null },
        { "name": "Vin", "desc": "Rødvin, hvidvin og rosé.", "price": null },
        { "name": "Snaps", "desc": "", "price": null }
      ]}
    ]
  }
}
$json$::jsonb)
on conflict (id) do nothing;
