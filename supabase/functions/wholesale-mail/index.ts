import { createClient } from 'npm:@supabase/supabase-js@2';

// Único correo propio de la tienda: aviso de cuenta mayorista aprobada.
// (El de "olvidé mi contraseña" lo envía Supabase Auth por el SMTP de Resend.)
const FROM = 'Exotic Joyería <pedidos@exoticjoyeria.lat>';
const SITE = 'https://exoticjoyeria.lat';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const approvedHtml = (business: string) => `
<div style="font-family:Georgia,serif;max-width:520px;margin:auto;color:#0c0c0c">
  <div style="background:#0c0c0c;color:#d4af37;padding:20px;text-align:center;letter-spacing:3px">EXÓTIC JOYERÍA</div>
  <div style="padding:24px;background:#fffdf8;font-family:Arial,sans-serif;font-size:15px;line-height:1.6">
    <h2 style="font-family:Georgia,serif;margin-top:0">¡Tu cuenta mayorista fue aprobada!</h2>
    <p>Hola ${esc(business)}, ya puedes ingresar con tu correo y contraseña para ver los precios mayoristas y hacer tu pedido.</p>
    <p><a href="${SITE}/mayoristas" style="display:inline-block;background:#0c0c0c;color:#d4af37;padding:12px 24px;text-decoration:none;letter-spacing:2px">INGRESAR</a></p>
  </div>
</div>`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  let payload: { action?: string; user_id?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'bad_json' }, 400);
  }

  // Comprobación de configuración (no revela el valor del secreto)
  if (payload.action === 'health') return json({ resend_key_configured: Boolean(Deno.env.get('RESEND_API_KEY')) });
  if (payload.action !== 'approved') return json({ error: 'unknown_action' }, 400);
  if (!Deno.env.get('RESEND_API_KEY')) return json({ error: 'not_configured' }, 500);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    // Solo un admin autenticado; el estado se lee de la base, no del navegador.
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: caller } = await admin.auth.getUser(token);
    if (!caller?.user) return json({ error: 'unauthorized' }, 401);
    const { data: isAdmin } = await admin.from('admins').select('user_id').eq('user_id', caller.user.id).maybeSingle();
    if (!isAdmin) return json({ error: 'forbidden' }, 403);

    const { data: w } = await admin.from('wholesalers').select('*').eq('user_id', String(payload.user_id ?? '')).maybeSingle();
    if (!w || !w.email) return json({ error: 'not_found' }, 404);
    if (w.status !== 'approved') return json({ ok: true, sent: false });
    if (w.last_status_notified === 'approved') return json({ ok: true, sent: false, already: true });

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [w.email], subject: '¡Tu cuenta mayorista fue aprobada!', html: approvedHtml(w.business_name) }),
    });
    if (!res.ok) throw new Error(`resend_${res.status}`);

    await admin.from('wholesalers').update({ last_status_notified: 'approved' }).eq('user_id', w.user_id);
    return json({ ok: true, sent: true });
  } catch (e) {
    console.error('wholesale-mail', e instanceof Error ? e.message : e);
    return json({ error: 'send_failed' }, 502);
  }
});
