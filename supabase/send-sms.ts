// ============================================================
// SPIIS – Edge Function: send-sms
// Sender kunden to sms'er fra "Spiis":
//   1) en bekræftelse lige når bestillingen er lagt ind på hjemmesiden (én sms)
//   2) en påmindelse ca. 30 minutter før afhentning / bordet
//
// Kaldes af databasen selv (se supabase/sms.sql):
//   · {"mode":"bekraeft","id":"<ordre-id>"}  – fra en trigger ved ny web-bestilling
//   · {"mode":"paamind"}                     – hvert 5. minut fra pg_cron
//
// Indsættes i Supabase → Edge Functions → Deploy new function (navn: send-sms).
// Slå "Verify JWT" FRA – funktionen beskyttes af x-spiis-secret-headeren.
// Secrets (Edge Functions → Secrets):
//   GATEWAYAPI_TOKEN  – fra gatewayapi.com (API → API Keys)
//   SMS_SECRET        – samme lange tilfældige tekst som i vault (se sms.sql)
//   SMS_AKTIV         – "ja" for at sende. Alt andet = funktionen logger bare,
//                       hvad den VILLE have sendt (sikkert at sætte op i ro og mag)
//   SMS_KUN_TIL       – valgfri: ét nummer (fx 12345678). Så går sms'er KUN
//                       dertil – til at prøve det af på egen telefon først
//   SMS_API_URL       – valgfri, standard https://gatewayapi.com/rest/mtsms
//
// En sms må ALDRIG stå i vejen for en bestilling: bestillingen er gemt, før
// vi overhovedet bliver kaldt, og går noget galt her, sker der bare intet.
// Hver sms "gøres krav på" i databasen, før den sendes (sms_*_at sættes),
// så den samme kunde aldrig får den samme besked to gange.
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const supa = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const AKTIV = (Deno.env.get('SMS_AKTIV') || '').toLowerCase() === 'ja';
const KUN_TIL = (Deno.env.get('SMS_KUN_TIL') || '').replace(/\D/g, '');
const API = Deno.env.get('SMS_API_URL') || 'https://gatewayapi.com/rest/mtsms';
const TELEFON = '93 99 58 58';

/* dansk nummer → 45xxxxxxxx. Udenlandske numre med landekode får lov at gå igennem. */
function msisdn(tlf: string): string | null {
  let n = String(tlf || '').replace(/[^\d+]/g, '');
  if (n.startsWith('+')) n = n.slice(1);
  else if (n.startsWith('00')) n = n.slice(2);
  if (/^\d{8}$/.test(n)) n = '45' + n;
  return /^\d{10,15}$/.test(n) ? n : null;
}

/* klokken i Danmark lige nu – og for et vilkårligt tidspunkt */
function lokal(d: Date) {
  const del = Object.fromEntries(new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((p) => [p.type, p.value]));
  return { iso: `${del.year}-${del.month}-${del.day}`, min: Number(del.hour) * 60 + Number(del.minute) };
}
const tilMin = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

const UGEDAGE = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MDR = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];
function dagTekst(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const dato = new Date(Date.UTC(y, m - 1, d, 12));
  return `${UGEDAGE[dato.getUTCDay()]} d. ${d}. ${MDR[m - 1]}`;
}
const fornavn = (navn: string) => String(navn || '').trim().split(/\s+/)[0] || '';

type Ordre = {
  id: string; date: string; time: string; type: string; name: string; phone: string;
  qty: number; persons: number | null; items: { name: string; qty: number; kind?: string; valg?: string }[];
  created_at: string; status?: string;
};

function hvad(o: Ordre) {
  const linjer = (o.items || []).filter((l) => l && l.qty > 0 && l.kind !== 'emballage' && l.kind !== 'genbrug');
  if (linjer.some((l) => l.kind === 'tapas')) return `tapas til ${o.persons || o.qty} pers.`;
  const tekst = linjer.map((l) => `${l.qty} x ${l.name}${l.valg ? ` (${l.valg})` : ''}`).join(', ');
  return tekst.length > 70 ? `${linjer.reduce((s, l) => s + l.qty, 0)} retter` : tekst || 'din bestilling';
}
const erTapas = (o: Ordre) => (o.items || []).some((l) => l && l.kind === 'tapas');

/* Bekræftelsen holdes på ÉN sms (højst 160 tegn) – så koster en bestilling 2 sms'er i alt.
   Bliver retterne for lange, står der bare antallet ("3 retter"). */
function bekraeftelse(o: Ordre) {
  /* påmindelsen kommer kun, når der er mindst en time til – så lover vi den kun dér */
  const nu = lokal(new Date());
  const afhent = tilMin(o.time);
  const faarPaamind = o.date > nu.iso || (o.date === nu.iso && afhent !== null && afhent - nu.min >= 60);
  const [, m, d] = o.date.split('-').map(Number);
  const dag = UGEDAGE[new Date(o.date + 'T12:00:00Z').getUTCDay()].slice(0, 3);
  const hvornaar = `${o.type === 'spise' ? 'spis her' : 'afhentning'} ${dag}. ${d}/${m} kl. ${o.time}`;
  const navn = fornavn(o.name).slice(0, 14);
  const lav = (hvad: string) => `Tak, ${navn}! Spiis har din bestilling: ${hvad}, ${hvornaar}.`
    + `${faarPaamind ? ' Påmindelse kommer 30 min før.' : ''} Afbud: ${TELEFON}`;
  const linjer = (o.items || []).filter((l) => l && l.qty > 0 && l.kind !== 'emballage' && l.kind !== 'genbrug');
  const antal = erTapas(o) ? `tapas til ${o.persons || o.qty} pers.` : `${linjer.reduce((n, l) => n + l.qty, 0)} retter`;
  const fuld = lav(hvad(o));
  return fuld.length <= 160 ? fuld : lav(antal);
}
function paamindelse(o: Ordre) {
  const hvad2 = erTapas(o) ? 'jeres tapas' : 'din mad';
  const linje = o.type === 'spise'
    ? `Om ca. 30 min står bordet klar til jer hos Spiis (kl. ${o.time}).`
    : `Om ca. 30 min er ${hvad2} klar til afhentning hos Spiis (kl. ${o.time}).`;
  return `Hej ${fornavn(o.name)}! ${linje} Kongens Enge 42, Karlslunde. Vi glæder os! Mvh Spiis`;
}

async function send(tlf: string, besked: string): Promise<boolean> {
  const nr = msisdn(tlf);
  if (!nr) { console.log('sms: ugyldigt nummer – springer over'); return true; }
  if (KUN_TIL && nr !== msisdn(KUN_TIL)) { console.log(`sms: SMS_KUN_TIL er sat – sender ikke til ${nr}`); return true; }
  if (!AKTIV) { console.log(`sms (IKKE sendt, SMS_AKTIV er ikke "ja") til ${nr}: ${besked}`); return true; }
  const svar = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Token ${Deno.env.get('GATEWAYAPI_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender: 'Spiis', message: besked, recipients: [{ msisdn: Number(nr) }] }),
  });
  if (!svar.ok) console.error('sms fejlede', svar.status, await svar.text().catch(() => ''));
  return svar.ok;
}

/* gør krav på en sms for en ordre: kun den der når at sætte feltet, sender */
async function krav(id: string, felt: 'sms_bekraeftet_at' | 'sms_paamindet_at') {
  const { data } = await supa.from('orders').update({ [felt]: new Date().toISOString() })
    .eq('id', id).is(felt, null).select('*');
  return (data && data[0]) as Ordre | undefined;
}
async function slip(id: string, felt: 'sms_bekraeftet_at' | 'sms_paamindet_at') {
  await supa.from('orders').update({ [felt]: null }).eq('id', id);
}

Deno.serve(async (req) => {
  if (req.headers.get('x-spiis-secret') !== Deno.env.get('SMS_SECRET')) {
    return new Response('forbidden', { status: 401 });
  }
  const kald = await req.json().catch(() => ({}));

  if (kald.mode === 'bekraeft' && kald.id) {
    const o = await krav(kald.id, 'sms_bekraeftet_at');
    if (o && !(await send(o.phone, bekraeftelse(o)))) await slip(o.id, 'sms_bekraeftet_at');
    return new Response('ok');
  }

  if (kald.mode === 'paamind') {
    const nu = lokal(new Date());
    const { data } = await supa.from('orders').select('*')
      .eq('date', nu.iso).is('sms_paamindet_at', null);
    for (const o of (data || []) as Ordre[]) {
      if (o.status === 'afvist' || o.status === 'annulleret') continue;
      const afhent = tilMin(o.time);
      if (afhent === null) continue;
      const til = afhent - nu.min;
      if (til <= 0 || til > 32) continue;
      /* bestilt kort før? Så er bekræftelsen påmindelse nok */
      const lagt = lokal(new Date(o.created_at));
      if (lagt.iso === nu.iso && afhent - lagt.min < 60) continue;
      const fri = await krav(o.id, 'sms_paamindet_at');
      if (fri && !(await send(fri.phone, paamindelse(fri)))) await slip(fri.id, 'sms_paamindet_at');
    }
    return new Response('ok');
  }

  return new Response('ignored');
});
