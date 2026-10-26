import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { list, put, del } from '@vercel/blob';

const COOKIE = 'mv_admin';
const SESSION_SECS = 12 * 3600;
const STORE_PATH = 'store.json';

/* ---------- sesión (cookie firmada, sin base de datos) ---------- */
const secret = () => process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || '';
const sign = v => createHmac('sha256', secret()).update(v).digest('base64url');

export function sameStr(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}
export function passwordOk(pw) {
  const real = process.env.ADMIN_PASSWORD;
  return !!real && sameStr(pw, real);
}
export function sessionCookie(req) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_SECS;
  const secure = (req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : '';
  return `${COOKIE}=${exp}.${sign(String(exp))}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECS}${secure}`;
}
export const clearCookie = `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
export function isAuthed(req) {
  if (!secret()) return false;
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  return !!sig && Number(exp) > Date.now() / 1000 && sameStr(sig, sign(exp));
}
/* Todas las rutas que cambian algo exigen sesión y la cabecera X-Requested-With */
export function requireAdmin(req, res, { write = false } = {}) {
  if (!isAuthed(req)) { res.status(401).json({ error: 'Inicia sesión' }); return false; }
  if (write && req.headers['x-requested-with'] !== 'mv-admin') { res.status(403).json({ error: 'Solicitud no permitida' }); return false; }
  return true;
}

/* ---------- datos: store.json en Vercel Blob (con la copia de data/store.json como respaldo inicial) ---------- */
export async function readSeed() {
  return JSON.parse(await readFile(join(process.cwd(), 'data', 'store.json'), 'utf8'));
}
export async function readStore() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { blobs } = await list({ prefix: STORE_PATH, limit: 1 });
    const b = blobs.find(x => x.pathname === STORE_PATH);
    if (b) {
      const r = await fetch(b.url + '?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) return { store: await r.json(), fromBlob: true };
    }
  }
  return { store: await readSeed(), fromBlob: false };
}
export async function writeStore(store) {
  const body = JSON.stringify(store, null, 2);
  const opts = { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' };
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  await put(`backups/store-${stamp}.json`, body, { ...opts, cacheControlMaxAge: 60 });
  await put(STORE_PATH, body, { ...opts, cacheControlMaxAge: 60 });
  const { blobs } = await list({ prefix: 'backups/' });
  const old = blobs.sort((a, b) => a.pathname.localeCompare(b.pathname)).slice(0, -30);
  if (old.length) await del(old.map(b => b.url));
}

export function validate(store) {
  if (!store || typeof store !== 'object' || typeof store.config !== 'object' || typeof store.data !== 'object') return 'Formato de datos inválido';
  const d = store.data;
  for (const [k, t] of [['products', 'array'], ['catOrder', 'array'], ['episodes', 'array'], ['topics', 'array'], ['featured', 'array'],
    ['catSub', 'object'], ['catTone', 'object'], ['catShort', 'object'], ['mega', 'object'], ['shipping', 'object'], ['payments', 'object'], ['help', 'object']]) {
    if (t === 'array' ? !Array.isArray(d[k]) : (typeof d[k] !== 'object' || d[k] === null || Array.isArray(d[k]))) return `Falta o es inválido: ${k}`;
  }
  const ids = new Set();
  for (const p of d.products) {
    if (!p || !Number.isInteger(p.id) || ids.has(p.id)) return 'Producto con id inválido o repetido';
    ids.add(p.id);
    if (!String(p.name || '').trim()) return 'Hay un producto sin nombre';
    if (typeof p.price !== 'number' || p.price < 0) return `Precio inválido en «${p.name}»`;
    if (!d.catOrder.includes(p.cat)) return `«${p.name}» tiene una categoría que no existe`;
  }
  return null;
}
