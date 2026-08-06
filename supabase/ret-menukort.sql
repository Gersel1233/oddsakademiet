-- ============================================================
-- NYT MENUKORT (aflæst fra det fysiske menukort, august 2026)
-- Køres ÉN gang i Supabase → SQL Editor → Run.
--
-- · Alle mad-kategorier serveres på HVERDAGE
-- · Frituren serveres ALLE dage (også weekend)
-- · En eksisterende drikkevare-kategori bevares automatisk
-- · Rører IKKE ved bookinger, bestillinger, dagens retter, tider osv.
-- ============================================================

update config
set data = jsonb_set(
  data,
  '{menu,categories}',
  '[
    {
      "id": "burgere", "name": "Burgere", "availability": "hverdage",
      "items": [
        { "name": "Smash-burger",           "desc": "",                              "price": 99  },
        { "name": "Smash-burger som menu",  "desc": "Med pommes, dip og sodavand.",  "price": 149 },
        { "name": "Børneburger",            "desc": "",                              "price": 69  },
        { "name": "Børneburger som menu",   "desc": "Med pommes, dip og sodavand.",  "price": 119 }
      ]
    },
    {
      "id": "friture", "name": "Frituren", "availability": "alle",
      "items": [
        { "name": "Pommes med dip",             "desc": "",       "price": 35 },
        { "name": "Pommes med nuggets og dip",  "desc": "",       "price": 79 },
        { "name": "Chili cheese tops",          "desc": "5 stk.", "price": 30 }
      ]
    },
    {
      "id": "salater", "name": "Salater", "availability": "hverdage",
      "items": [
        { "name": "Cæsarsalat",   "desc": "", "price": 99 },
        { "name": "Dagens salat", "desc": "", "price": 60 }
      ]
    },
    {
      "id": "panini", "name": "Panini & sandwich", "availability": "hverdage",
      "items": [
        { "name": "Panini",                   "desc": "Skinke/ost eller kylling/ost/pesto.", "price": 35 },
        { "name": "Sandwich med dagens fyld", "desc": "",                                    "price": 80 }
      ]
    },
    {
      "id": "nachosbowls", "name": "Nachos & bowls", "availability": "hverdage",
      "items": [
        { "name": "Nachos",                   "desc": "Med kylling, ost, salsa og creme fraiche.", "price": 89 },
        { "name": "Pokebowl med dagens fyld", "desc": "",                                          "price": 99 }
      ]
    }
  ]'::jsonb
  || coalesce(
       (select jsonb_agg(c)
          from jsonb_array_elements(data->'menu'->'categories') c
         where lower(c->>'name') like '%drik%'),
       '[]'::jsonb)
)
where id = 1;

-- Tjek resultatet: skal vise de nye kategorier (+ evt. drikkevarer til sidst)
select jsonb_array_elements(data->'menu'->'categories')->>'name' as kategori
from config where id = 1;
