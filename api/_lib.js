import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { list, put, del } from '@vercel/blob';

const COOKIE = 'mv_admin';
const SESSION_SECS = 12 * 3600;
const STORE_PATH = 'store.json';
/* Sin Blob y fuera de Vercel (npm run dev) todo se guarda en la carpeta .data/ */
export const LOCAL = !process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL;
export const LOCAL_DIR = join(process.cwd(), '.data');

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
/* Modelo único de filtros: data.catFilters[categoría] = [{ id, name, multi, options[] }]; cada producto guarda p.f[id] = [valores].
   Convierte los datos antiguos (subcategoría + «Por beneficio») la primera vez que se leen. */
export function migrateFilters(store) {
  const d = store && store.data;
  if (!d || d.catFilters) return store;
  const old = d.catFilter || {}, oldGoals = d.catGoals || {};
  d.catFilters = {};
  for (const c of d.catOrder || []) {
    const list = [], cf = old[c] || {}, gl = oldGoals[c] || [];
    const prods = d.products.filter(p => p.cat === c);
    const used = [...new Set(prods.map(p => p.sub).filter(Boolean))];
    const opts = cf.options && cf.options.length ? [...cf.options, ...used.filter(u => !cf.options.includes(u))] : used;
    const hasSub = opts.length > 0 || !!cf.label;
    if (hasSub) list.push({ id: 'sub', name: cf.label || 'Subcategoría', multi: false, options: opts });
    if (gl.length) list.push({ id: 'ben', name: 'Por beneficio', multi: true, options: [...gl] });
    d.catFilters[c] = list;
    for (const p of prods) {
      const f = {};
      if (hasSub && p.sub) f.sub = [p.sub];
      if (gl.length && p.goals && p.goals.length) f.ben = p.goals.filter(g => gl.includes(g));
      if (Object.keys(f).length) p.f = f;
      delete p.goals;
    }
    for (const col of (d.mega && d.mega[c] && d.mega[c].cols) || []) { if (col.kind === 'goal') col.fid = 'ben'; delete col.kind; }
  }
  delete d.catFilter; delete d.catGoals; delete d.goals;
  return store;
}
/* Medios de pago: valores por defecto; lo que guarde el panel se mezcla encima */
export const PAY_DEFAULTS = {
  yape: { on: true, number: '', holder: '', qr: '' },
  bank: { on: true, bank: 'BCP', account: '', cci: '', holder: '' },
  card: { on: true, surcharge: 0 }
};
/* Distritos de reparto en Lima y Callao: [distrito, zona, ¿se envía?, costo S/, observación].
   Los nombres son fijos; lo que se edita en el panel (Envíos) es si se envía, el costo y la observación. */
const DISTRICTS = [
  ["Ancón", "Lima", false, null, "Fuera de zona de reparto"],
  ["Ate", "Lima", false, null, "Fuera de zona de reparto"],
  ["Barranco", "Lima", false, null, "Fuera de zona de reparto"],
  ["Breña", "Lima", true, 10, ""],
  ["Carabayllo", "Lima", true, 10, ""],
  ["Chaclacayo", "Lima", false, null, "Fuera de zona de reparto"],
  ["Chorrillos", "Lima", false, null, "Fuera de zona de reparto"],
  ["Cieneguilla", "Lima", false, null, "Fuera de zona de reparto"],
  ["Comas", "Lima", true, 10, ""],
  ["El Agustino", "Lima", false, null, "Fuera de zona de reparto"],
  ["Independencia", "Lima", true, 10, ""],
  ["Jesús María", "Lima", true, 10, ""],
  ["La Molina", "Lima", true, 12, ""],
  ["La Victoria", "Lima", true, 10, ""],
  ["Lima (Cercado)", "Lima", true, 10, ""],
  ["Lince", "Lima", true, 10, ""],
  ["Los Olivos", "Lima", true, 10, ""],
  ["Lurigancho (Chosica)", "Lima", false, null, "Fuera de zona de reparto"],
  ["Lurín", "Lima", false, null, "Fuera de zona de reparto"],
  ["Magdalena del Mar", "Lima", true, 10, ""],
  ["Miraflores", "Lima", true, 10, ""],
  ["Pachacámac", "Lima", false, null, "Fuera de zona de reparto"],
  ["Pucusana", "Lima", false, null, "Fuera de zona de reparto"],
  ["Pueblo Libre", "Lima", true, 10, ""],
  ["Puente Piedra", "Lima", true, 12, ""],
  ["Punta Hermosa", "Lima", false, null, "Fuera de zona de reparto"],
  ["Punta Negra", "Lima", false, null, "Fuera de zona de reparto"],
  ["Rímac", "Lima", true, 10, ""],
  ["San Bartolo", "Lima", false, null, "Fuera de zona de reparto"],
  ["San Borja", "Lima", true, 12, ""],
  ["San Isidro", "Lima", true, 10, ""],
  ["San Juan de Lurigancho", "Lima", true, 12, ""],
  ["San Juan de Miraflores", "Lima", true, 15, ""],
  ["San Luis", "Lima", true, 12, ""],
  ["San Martín de Porres", "Lima", true, 10, ""],
  ["San Miguel", "Lima", true, 10, ""],
  ["Santa Anita", "Lima", true, 12, ""],
  ["Santa María del Mar", "Lima", false, null, "Fuera de zona de reparto"],
  ["Santa Rosa", "Lima", false, null, "Fuera de zona de reparto"],
  ["Santiago de Surco", "Lima", true, 10, ""],
  ["Surquillo", "Lima", true, 10, ""],
  ["Villa El Salvador", "Lima", false, null, "Fuera de zona de reparto"],
  ["Villa María del Triunfo", "Lima", false, null, "Fuera de zona de reparto"],
  ["Bellavista", "Callao", true, 10, ""],
  ["Callao", "Callao", true, 12, ""],
  ["Carmen de la Legua Reynoso", "Callao", true, 12, ""],
  ["La Perla", "Callao", true, 12, ""],
  ["La Punta", "Callao", true, 12, ""],
  ["Mi Perú", "Callao", false, null, "Fuera de zona de reparto"],
  ["Ventanilla", "Callao", false, null, "Fuera de zona de reparto"]
];
export function normDistricts(src) {
  const by = new Map((Array.isArray(src) ? src : []).map(d => [d && d.name, d]));
  return DISTRICTS.map(([name, zone, ship, cost, note]) => {
    const d = by.get(name) || { ship, cost, note };
    const c = d.cost === null || d.cost === '' || d.cost === undefined ? null : Math.max(0, Math.round(Number(d.cost) * 100) / 100);
    const ok = d.ship === true && c !== null && !Number.isNaN(c);
    return { name, zone, ship: ok, cost: Number.isNaN(c) ? null : c, note: String(d.note ?? '').trim().slice(0, 100) };
  });
}
/* Cupones: { CÓDIGO: { type: 'pct' | 'amt', value, min, expires: 'AAAA-MM-DD' | '', active } }. El formato antiguo era { CÓDIGO: 0.1 } */
export function normCoupons(src) {
  const out = {};
  for (const [code, v] of Object.entries(src || {})) {
    const c = String(code).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24);
    if (!c) continue;
    if (typeof v === 'number') { if (v > 0 && v <= 0.9) out[c] = { type: 'pct', value: Math.round(v * 100), min: 0, expires: '', active: true }; continue; }
    if (!v || typeof v !== 'object') continue;
    const type = v.type === 'amt' ? 'amt' : 'pct';
    const n = Number(v.value) || 0;
    const value = type === 'pct' ? Math.min(90, Math.round(n)) : Math.round(n * 100) / 100;
    if (value <= 0) continue;
    out[c] = { type, value, min: Math.max(0, Number(v.min) || 0), expires: /^\d{4}-\d{2}-\d{2}$/.test(v.expires || '') ? v.expires : '', active: v.active !== false };
  }
  return out;
}
export function migrateConfig(store) {
  const c = store && store.config;
  if (!c || typeof c !== 'object') return store;
  const txt = (v, n) => String(v ?? '').trim().slice(0, n);
  const src = c.pay && typeof c.pay === 'object' ? c.pay : {};
  const pay = {};
  for (const [k, def] of Object.entries(PAY_DEFAULTS)) {
    const o = { ...def, ...(src[k] && typeof src[k] === 'object' ? src[k] : {}) };
    for (const f of Object.keys(def)) if (typeof def[f] === 'string') o[f] = txt(o[f], 200);
    o.on = o.on !== false;
    if (k === 'card') o.surcharge = Math.min(15, Math.max(0, Math.round((Number(o.surcharge) || 0) * 100) / 100));
    pay[k] = o;
  }
  c.pay = pay;
  c.coupons = normCoupons(c.coupons);
  if (store.data && typeof store.data === 'object') store.data.districts = normDistricts(store.data.districts);
  return store;
}
/* Sin control de stock: los productos agotados (stock 0) pasan a «ocultos» y se elimina el campo stock. */
export function migrateStock(store) {
  const d = store && store.data;
  if (!d || !Array.isArray(d.products)) return store;
  for (const p of d.products) {
    if ('stock' in p) { if (!(p.stock > 0) && p.active === undefined) p.active = false; delete p.stock; }
  }
  return store;
}
export async function readStore() {
  if (LOCAL) {
    try { return { store: migrateConfig(migrateStock(migrateFilters(JSON.parse(await readFile(join(LOCAL_DIR, 'store.json'), 'utf8'))))), fromBlob: false }; } catch { /* sin copia local: se usa la semilla */ }
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { blobs } = await list({ prefix: STORE_PATH, limit: 1 });
    const b = blobs.find(x => x.pathname === STORE_PATH);
    if (b) {
      const r = await fetch(b.url + '?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) return { store: migrateConfig(migrateStock(migrateFilters(await r.json()))), fromBlob: true };
    }
  }
  return { store: migrateConfig(migrateStock(migrateFilters(await readSeed()))), fromBlob: false };
}
export async function writeStore(store) {
  const body = JSON.stringify(store, null, 2);
  if (LOCAL) { await mkdir(LOCAL_DIR, { recursive: true }); await writeFile(join(LOCAL_DIR, 'store.json'), body); return; }
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
  if (d.heroes !== undefined && !Array.isArray(d.heroes)) return 'Campañas inválidas';
  if (d.hero !== undefined && (typeof d.hero !== 'object' || d.hero === null || Array.isArray(d.hero))) return 'Portada inválida';
  if (d.featured.length > 8) return 'Máximo 8 productos destacados en el inicio';
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
