#!/usr/bin/env node
// Verificación de la Fase 0 contra el Supabase REAL, con la clave anon (pública, la misma que usa el navegador).
// Uso:  node scripts/verify-phase0.mjs
// Lee VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY de .env (o de las variables de entorno). No usa ni necesita claves privadas.
//
// SEGURIDAD DE LA PRUEBA: el POST a /orders lleva un cuerpo INVÁLIDO a propósito (nombre de 1 letra, total negativo, estado 'confirmed'),
// así que aunque el hueco siga abierto la política WITH CHECK lo rechaza y NUNCA se crea un pedido real. Lo que cambia es el mensaje:
//   hueco abierto  → "new row violates row-level security policy"   (la política evaluó la fila)
//   hueco cerrado  → "permission denied for table orders"           (ni siquiera se permite intentar insertar)
// Sale con código 0 si todo lo comprobable con anon está en orden, 1 si algo falla.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function loadEnv() {
  const env = { ...process.env };
  try {
    const file = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* sin .env: se usan las variables de entorno */ }
  return env;
}

const env = loadEnv();
const URL_ = (env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
const KEY = env.VITE_SUPABASE_ANON_KEY ?? '';
if (!URL_ || !KEY) {
  console.error('Falta VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY (.env).');
  process.exit(1);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'OK   ' : 'FALLA'}  ${name}${detail ? `\n         ${detail}` : ''}`);
};
const readBody = async (res) => {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { message: text }; }
};

// 0.2 · INSERT directo a orders
{
  const res = await fetch(`${URL_}/rest/v1/orders`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ customer_name: 'x', customer_phone: '1', items: [], total_amount: -1, status: 'confirmed' }),
  });
  const body = await readBody(res);
  const msg = String(body.message ?? '');
  if (res.ok) {
    record('0.2 anon NO puede insertar en orders', false, `¡El servidor ACEPTÓ el POST (HTTP ${res.status})! Revisar de inmediato: puede haberse creado una fila.`);
  } else if (/permission denied for table orders/i.test(msg)) {
    record('0.2 anon NO puede insertar en orders', true, `HTTP ${res.status}: permiso de INSERT revocado (migración 060 aplicada).`);
  } else if (/row-level security/i.test(msg)) {
    record('0.2 anon NO puede insertar en orders', false, `HTTP ${res.status}: la política orders_insert_public sigue activa (migración 060 NO aplicada). Un cuerpo válido sí insertaría.`);
  } else {
    record('0.2 anon NO puede insertar en orders', false, `Respuesta inesperada HTTP ${res.status}: ${msg || JSON.stringify(body)}`);
  }
}

// 0.2 · anon tampoco lee pedidos (datos de clientes)
{
  const res = await fetch(`${URL_}/rest/v1/orders?select=id&limit=1`, { headers });
  const body = await readBody(res);
  const leaked = res.ok && Array.isArray(body) && body.length > 0;
  record('0.2 anon NO lee pedidos', !leaked, leaked ? 'anon recibió filas de orders.' : `HTTP ${res.status}`);
}

// 0.3 · anon no lee wholesalers (ni columnas internas)
for (const cols of ['notes', 'reviewed_by', 'last_status_notified', '*']) {
  const res = await fetch(`${URL_}/rest/v1/wholesalers?select=${encodeURIComponent(cols)}&limit=1`, { headers });
  const body = await readBody(res);
  const leaked = res.ok && Array.isArray(body) && body.length > 0;
  record(`0.3 anon NO lee wholesalers.${cols}`, !leaked, leaked ? 'anon recibió filas.' : `HTTP ${res.status}`);
}

// 0.3 · la RPC de admin existe (aplicada 061) pero rechaza a anon
{
  const res = await fetch(`${URL_}/rest/v1/rpc/admin_list_wholesalers`, { method: 'POST', headers, body: JSON.stringify({ p_status: null }) });
  const body = await readBody(res);
  const msg = String(body.message ?? '');
  const exists = !(res.status === 404 || /could not find the function/i.test(msg));
  const denied = !res.ok;
  record('0.3 admin_list_wholesalers existe (061) y anon no puede usarla', exists && denied,
    !exists ? 'No existe: aplicar la migración 061.' : denied ? `HTTP ${res.status}: ${msg}` : 'anon pudo ejecutarla.');
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} comprobaciones correctas.`);
console.log('Pendiente de comprobar a mano (requiere sesión): que un mayorista autenticado NO lea notes → supabase/checks/phase0_postcheck.sql');
process.exit(failed ? 1 : 0);
