// ============================================================
// SPIIS – Edge Function: enhance-image
// Finpudser et nyhedsbillede med fal.ai (Nano Banana Pro) og
// lægger resultatet i "nyheder"-arkivet. Kaldes af admin-appen,
// når chefen lægger en nyhed op med billede.
//
// Indsættes i Supabase → Edge Functions → Deploy new function
// (navn: enhance-image). Kræver denne secret (Edge Functions →
// Secrets): FAL_KEY (din fal.ai-nøgle – kommer ALDRIG i koden).
// SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY sætter Supabase selv.
//
// LAD "Verify JWT" være slået TIL for funktionen – så kan kun den
// indloggede chef kalde den (i modsætning til send-push).
// ============================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FAL_MODEL = 'fal-ai/nano-banana-pro/edit';

// Vigtigt for en madvirksomhed: AI'en må KUN finpudse – aldrig ændre maden.
const PROMPT = [
  'Enhance this photo of real, homemade food for a restaurant website.',
  'Improve the lighting, white balance, colours and sharpness so it looks clean,',
  'fresh and appetising, like a professional food photograph.',
  'Keep the exact same dish, plating and ingredients – do NOT add, remove or change',
  'any food or objects. Keep it natural and realistic. Nice landscape composition.',
].join(' ');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    const FAL_KEY = Deno.env.get('FAL_KEY');
    const SB_URL = Deno.env.get('SUPABASE_URL');
    const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!FAL_KEY || !SB_URL || !SB_KEY) return json({ ok: false, error: 'config' });

    const { imageUrl } = await req.json().catch(() => ({}));
    if (!imageUrl || typeof imageUrl !== 'string') return json({ ok: false, error: 'no-image' });

    // 1) bed fal.ai om at finpudse billedet (synkront kald – venter på resultatet)
    const falRes = await fetch(`https://fal.run/${FAL_MODEL}`, {
      method: 'POST',
      headers: { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: PROMPT,
        image_urls: [imageUrl],
        aspect_ratio: '3:2',
        output_format: 'jpeg',
        resolution: '1K',
        num_images: 1,
      }),
    });
    if (!falRes.ok) return json({ ok: false, error: 'fal', status: falRes.status });
    const falOut = await falRes.json().catch(() => ({}));
    const outUrl = falOut?.images?.[0]?.url;
    if (!outUrl) return json({ ok: false, error: 'no-result' });

    // 2) hent det forbedrede billede og læg det i vores eget arkiv,
    //    så det bliver liggende (fal's egne links er midlertidige)
    const imgRes = await fetch(outUrl);
    if (!imgRes.ok) return json({ ok: false, error: 'download' });
    const bytes = new Uint8Array(await imgRes.arrayBuffer());
    const path = `forbedret-${Date.now().toString(36)}.jpg`;
    const upRes = await fetch(`${SB_URL}/storage/v1/object/nyheder/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'image/jpeg',
        'x-upsert': 'true',
      },
      body: bytes,
    });
    if (!upRes.ok) return json({ ok: false, error: 'upload', status: upRes.status });

    return json({ ok: true, url: `${SB_URL}/storage/v1/object/public/nyheder/${path}` });
  } catch (e) {
    return json({ ok: false, error: String(e) });
  }
});
