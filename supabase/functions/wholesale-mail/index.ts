import { createClient } from 'npm:@supabase/supabase-js@2';

// Único correo propio de la tienda: aviso de cuenta de negocio aprobada (mayorista o emprendedor).
// (El de "olvidé mi contraseña" lo envía Supabase Auth por el SMTP de Resend.)
const FROM = 'Exotic Joyería <pedidos@exoticjoyeria.lat>';
const SITE = 'https://exoticjoyeria.lat';

type AccountType = 'wholesale' | 'entrepreneur';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const cop = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');

// Textos según el tipo REAL de la cuenta (se lee de la base de datos, nunca del payload)
const COPY: Record<AccountType, { subject: string; heading: string; intro: string; defaultMin: number; minKey: string }> = {
  wholesale: {
    subject: '¡Tu cuenta mayorista fue aprobada!',
    heading: '¡Tu cuenta mayorista fue aprobada!',
    intro: 'ya puedes ingresar con tu correo y contraseña para ver los precios mayoristas y hacer tu pedido.',
    defaultMin: 3_500_000,
    minKey: 'wholesale_min_cop',
  },
  entrepreneur: {
    subject: '¡Tu cuenta de emprendedor fue aprobada!',
    heading: '¡Tu cuenta de emprendedor fue aprobada!',
    intro: 'ya puedes ingresar con tu correo y contraseña para ver los precios de emprendedor y hacer tu pedido.',
    defaultMin: 500_000,
    minKey: 'entrepreneur_min_cop',
  },
};

const approvedHtml = (type: AccountType, business: string, min: number) => `
<div style="font-family:Georgia,serif;max-width:520px;margin:auto;color:#0c0c0c">
  <div style="background:#0c0c0c;color:#d4af37;padding:20px;text-align:center;letter-spacing:3px">EXÓTIC JOYERÍA</div>
  <div style="padding:24px;background:#fffdf8;font-family:Arial,sans-serif;font-size:15px;line-height:1.6">
    <h2 style="font-family:Georgia,serif;margin-top:0">${esc(COPY[type].heading)}</h2>
    <p>Hola ${esc(business)}, ${esc(COPY[type].intro)}</p>
    <p>El pedido mínimo es de <b>${esc(cop(min))}</b> por pedido.</p>
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

  if (payload.action !== 'health' && payload.action !== 'approved') return json({ error: 'unknown_action' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Solo un admin autenticado (también para la comprobación de configuración).
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: caller } = await admin.auth.getUser(token);
  if (!caller?.user) return json({ error: 'unauthorized' }, 401);
  const { data: isAdmin } = await admin.from('admins').select('user_id').eq('user_id', caller.user.id).maybeSingle();
  if (!isAdmin) return json({ error: 'forbidden' }, 403);

  // Comprobación de configuración (no revela el valor del secreto)
  if (payload.action === 'health') return json({ resend_key_configured: Boolean(Deno.env.get('RESEND_API_KEY')) });
  if (!Deno.env.get('RESEND_API_KEY')) return json({ error: 'not_configured' }, 500);

  let claimed = false;
  let previous: string | null = null;
  let userId = '';
  try {
    // El estado y el tipo se leen de la base, no del navegador.
    const { data: w } = await admin.from('wholesalers').select('*').eq('user_id', String(payload.user_id ?? '')).maybeSingle();
    if (!w || !w.email) return json({ error: 'not_found' }, 404);
    if (w.status !== 'approved') return json({ ok: true, sent: false });
    userId = w.user_id;

    const type: AccountType = w.account_type === 'entrepreneur' ? 'entrepreneur' : 'wholesale';
    // Marcador por tipo ('approved:wholesale'); el valor viejo 'approved' (anterior a los tipos) equivale a mayorista.
    const marker = `approved:${type}`;
    const notified = w.last_status_notified === 'approved' ? 'approved:wholesale' : w.last_status_notified;
    if (notified === marker) return json({ ok: true, sent: false, already: true });

    // Solo se avisa a un correo confirmado
    const { data: au } = await admin.auth.admin.getUserById(w.user_id);
    if (!au?.user?.email_confirmed_at) return json({ ok: true, sent: false, unconfirmed: true });

    // Se marca ANTES de enviar y solo si nadie la marcó ya: dos clics seguidos no mandan dos correos
    previous = w.last_status_notified ?? null;
    let claim = admin.from('wholesalers').update({ last_status_notified: marker }).eq('user_id', w.user_id).select('user_id');
    claim = previous === null ? claim.is('last_status_notified', null) : claim.eq('last_status_notified', previous);
    const { data: claimedRows } = await claim;
    if (!claimedRows || claimedRows.length === 0) return json({ ok: true, sent: false, already: true });
    claimed = true;

    const { data: setting } = await admin.from('settings').select('value').eq('key', COPY[type].minKey).maybeSingle();
    const minRaw = Number(setting?.value);
    const min = Number.isFinite(minRaw) && minRaw >= 0 ? minRaw : COPY[type].defaultMin;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [w.email], subject: COPY[type].subject, html: approvedHtml(type, w.business_name, min) }),
    });
    if (!res.ok) throw new Error(`resend_${res.status}`);

    return json({ ok: true, sent: true, account_type: type });
  } catch (e) {
    // Si el envío falló se libera la marca para poder reintentar
    if (claimed && userId) await admin.from('wholesalers').update({ last_status_notified: previous }).eq('user_id', userId);
    console.error('wholesale-mail', e instanceof Error ? e.message : e);
    return json({ error: 'send_failed' }, 502);
  }
});
