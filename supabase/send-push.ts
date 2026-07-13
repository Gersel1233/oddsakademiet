// ============================================================
// SPIIS – Edge Function: send-push
// Kaldes af databasens webhooks, når der kommer en ny række i
// orders eller bookings, og sender push-besked til alle
// telefoner, der har slået notifikationer til i admin-appen.
//
// Indsættes i Supabase → Edge Functions → Deploy new function
// (navn: send-push). Kræver disse secrets (Edge Functions →
// Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_SECRET.
// Slå "Verify JWT" FRA for funktionen – den beskyttes i stedet
// af PUSH_SECRET-headeren fra webhooken.
// ============================================================

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

webpush.setVapidDetails(
  'mailto:spiis.bestilling@gmail.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

Deno.serve(async (req) => {
  // kun databasens webhooks (med den hemmelige header) må kalde os
  if (req.headers.get('x-spiis-secret') !== Deno.env.get('PUSH_SECRET')) {
    return new Response('forbidden', { status: 401 });
  }

  const payload = await req.json().catch(() => ({}));
  if (payload.type !== 'INSERT' || !payload.record) {
    return new Response('ignored', { status: 200 });
  }

  const r = payload.record;
  let title = 'Spiis Admin';
  let body = 'Der er nyt i jeres overblik.';
  if (payload.table === 'orders') {
    title = '🍲 Ny bestilling';
    const dele = [r.name, r.time ? `kl. ${r.time}` : '', r.persons ? `${r.persons} pers.` : '']
      .filter(Boolean).join(' · ');
    body = `${dele} · ${r.type === 'togo' ? 'To-go' : 'Spiser her'}`;
  } else if (payload.table === 'bookings') {
    title = r.kind === 'moede' ? '📅 Ny mødebooking' : '🎉 Ny arrangement-forespørgsel';
    body = `${r.subject} · ${r.name}`;
  }

  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: subs } = await supa.from('push_subscriptions').select('*');

  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title, body, tag: `${payload.table}-${r.id ?? ''}` }),
      );
    } catch (err) {
      // telefonen har trukket tilladelsen tilbage → ryd op
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await supa.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      }
    }
  }));

  return new Response('ok', { status: 200 });
});
