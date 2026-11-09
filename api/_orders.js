import { randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { list, put } from '@vercel/blob';
import { LOCAL, LOCAL_DIR, sameStr } from './_lib.js';

/* Pedidos: cada uno es un archivo JSON propio (pedidos/<CÓDIGO>-<token>.json). El token es aleatorio:
   solo quien tiene el enlace puede ver el pedido; el listado completo es solo del panel. */

export const STATUSES = ['pending', 'review', 'paid', 'preparing', 'ready', 'delivered', 'cancelled'];
export const MAX_QTY = 10;
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_RE = /^MV-[A-Z0-9]{6}$/, TOKEN_RE = /^[a-f0-9]{32}$/;
const r2 = n => Math.round(n * 100) / 100;
const txt = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export class Fail extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

/* ---------- cupones ---------- */
const todayLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
export function evaluateCoupon(config, raw, sub) {
  const code = String(raw || '').trim().toUpperCase();
  const c = (config.coupons || {})[code];
  if (!c || !c.active) throw new Fail('El cupón no es válido');
  if (c.expires && c.expires < todayLima()) throw new Fail('Este cupón ya venció');
  if (c.min && sub < c.min) throw new Fail(`Este cupón aplica en compras desde S/ ${c.min}`);
  const discount = r2(Math.min(sub, c.type === 'pct' ? sub * c.value / 100 : c.value));
  return { code, type: c.type, value: c.value, min: c.min || 0, discount };
}

/* ---------- armado del pedido (el servidor decide precios, envío, descuento y recargo) ---------- */
export function buildOrder(store, b) {
  const { config, data } = store;
  if (!b || typeof b !== 'object') throw new Fail('Solicitud no válida');
  if (b.website) throw new Fail('Solicitud no válida'); // campo trampa para bots

  const name = txt(b.name, 80);
  if (name.length < 3) throw new Fail('Escribe tu nombre completo');
  const phone = String(b.phone || '').replace(/\D/g, '').replace(/^51(?=\d{9}$)/, '');
  if (!/^\d{9}$/.test(phone)) throw new Fail('Ingresa un celular de 9 dígitos');
  const email = txt(b.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Fail('El correo no es válido');

  /* productos */
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 30) throw new Fail('Tu carrito está vacío');
  const items = b.items.map(it => {
    const p = data.products.find(x => x.id === Number(it && it.id));
    if (!p || !(p.stock > 0)) throw new Fail('Un producto de tu carrito ya no está disponible');
    const qty = Math.floor(Number(it.qty));
    if (!(qty >= 1)) throw new Fail('Cantidad no válida');
    if (qty > Math.min(MAX_QTY, p.stock)) throw new Fail(p.stock < MAX_QTY ? `De «${p.name}» solo quedan ${p.stock} unidades` : `Máximo ${MAX_QTY} unidades por producto`);
    let opt = null;
    if (p.opt && p.opt.values && p.opt.values.length) {
      opt = txt(it.opt, 40);
      if (!p.opt.values.includes(opt)) throw new Fail(`Elige ${String(p.opt.label || 'una opción').toLowerCase()} para «${p.name}»`);
    }
    const img = (p.imgs && p.imgs[0]) || p.img || '';
    return { id: p.id, name: p.name, cat: p.cat, opt, optLabel: opt ? p.opt.label : '', qty, price: p.price, old: p.old > p.price ? p.old : 0, img };
  });
  const sub = r2(items.reduce((a, i) => a + i.price * i.qty, 0));
  const regular = r2(items.reduce((a, i) => a + (i.old || i.price) * i.qty, 0));

  /* entrega */
  const zone = (data.shipping || {})[b.ship];
  if (!zone) throw new Fail('Elige cómo quieres recibir tu pedido');
  const ship = b.ship;
  const address = { depto: '', prov: '', distrito: '', dir: '', ref: '' };
  if (ship !== 'pick') {
    address.distrito = txt(b.address && b.address.distrito, 60);
    address.dir = txt(b.address && b.address.dir, 160);
    address.ref = txt(b.address && b.address.ref, 160);
    if (ship === 'lima') { address.depto = 'Lima'; address.prov = 'Lima'; }
    else { address.depto = txt(b.address && b.address.depto, 60); address.prov = txt(b.address && b.address.prov, 60); if (!address.depto || !address.prov) throw new Fail('Indica departamento y provincia'); }
    if (!address.distrito) throw new Fail('Indica tu distrito');
    if (address.dir.length < 5) throw new Fail(ship === 'prov' ? 'Indica la agencia o dirección de entrega' : 'Escribe tu dirección completa');
  }
  const free = ship === 'lima' && config.freeShippingFrom > 0 && sub >= config.freeShippingFrom;
  const shipCost = free ? 0 : r2(Number(zone.p) || 0);

  /* pago */
  const method = String(b.pay || '');
  const pc = (config.pay || {})[method];
  if (!pc || !pc.on) throw new Fail('Elige un medio de pago');

  /* cupón */
  let coupon = null;
  if (b.coupon) coupon = evaluateCoupon(config, b.coupon, sub);
  const disc = coupon ? coupon.discount : 0;
  const base = r2(sub - disc + shipCost);
  const surPct = method === 'card' ? (Number(pc.surcharge) || 0) : 0;
  const surcharge = surPct > 0 ? r2(base * surPct / 100) : 0;
  const total = r2(base + surcharge);

  /* comprobante de pago (boleta o factura) */
  let doc = null;
  if (b.doc && b.doc.type) {
    if (b.doc.type === 'boleta') {
      const dni = String(b.doc.dni || '').trim();
      if (!/^\d{8}$/.test(dni)) throw new Fail('El DNI debe tener 8 dígitos');
      doc = { type: 'boleta', dni };
    } else if (b.doc.type === 'factura') {
      const ruc = String(b.doc.ruc || '').trim(), razon = txt(b.doc.razon, 120);
      if (!/^\d{11}$/.test(ruc)) throw new Fail('El RUC debe tener 11 dígitos');
      if (!razon) throw new Fail('Escribe la razón social');
      doc = { type: 'factura', ruc, razon };
    }
  }

  const now = new Date().toISOString();
  const code = 'MV-' + Array.from(randomBytes(6), x => ALPHA[x % ALPHA.length]).join('');
  return {
    code, token: randomBytes(16).toString('hex'), createdAt: now, status: 'pending',
    history: [{ status: 'pending', at: now, note: 'Pedido creado' }],
    customer: { name, phone, email },
    delivery: { ship, label: ship === 'pick' ? 'Recojo en tienda' : zone.l, eta: zone.s || '', address },
    items,
    totals: { regular, savings: r2(regular - sub), sub, coupon: coupon ? coupon.code : '', disc, ship: shipCost, freeShip: free, surchargePct: surPct, surcharge, total },
    pay: { method },
    doc, notes: txt(b.notes, 300), proof: null
  };
}

/* Vista pública: sin teléfono, correo ni documento */
export function publicOrder(o) {
  return {
    code: o.code, status: o.status, createdAt: o.createdAt, history: o.history, cancelNote: o.cancelNote || '',
    customer: { name: o.customer.name },
    delivery: { ship: o.delivery.ship, label: o.delivery.label, eta: o.delivery.eta, district: o.delivery.address.distrito },
    items: o.items, totals: o.totals, pay: o.pay, notes: o.notes,
    proof: o.proof ? { at: o.proof.at } : null
  };
}

/* ---------- almacenamiento ---------- */
const pathOf = (code, token) => `pedidos/${code}-${token}.json`;
const abs = p => join(LOCAL_DIR, p);

async function writeJson(path, obj) {
  const body = JSON.stringify(obj, null, 2);
  if (LOCAL) { await mkdir(dirname(abs(path)), { recursive: true }); await writeFile(abs(path), body); return; }
  await put(path, body, { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 60 });
}
async function fetchJson(url) {
  const r = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
  return r.ok ? r.json() : null;
}
export async function saveOrder(o) { await writeJson(pathOf(o.code, o.token), o); }

export async function readOrder(code, token) {
  if (!CODE_RE.test(code || '') || !TOKEN_RE.test(token || '')) return null;
  const path = pathOf(code, token);
  if (LOCAL) { try { return JSON.parse(await readFile(abs(path), 'utf8')); } catch { return null; } }
  const { blobs } = await list({ prefix: path, limit: 1 });
  const b = blobs.find(x => x.pathname === path);
  return b ? fetchJson(b.url) : null;
}
/* Solo para el panel: se busca por código */
export async function findOrder(code) {
  if (!CODE_RE.test(code || '')) return null;
  const prefix = `pedidos/${code}-`;
  if (LOCAL) {
    let names = []; try { names = await readdir(abs('pedidos')); } catch { /* aún no hay pedidos */ }
    const n = names.find(x => x.startsWith(`${code}-`));
    return n ? JSON.parse(await readFile(abs('pedidos/' + n), 'utf8')) : null;
  }
  const { blobs } = await list({ prefix, limit: 1 });
  return blobs[0] ? fetchJson(blobs[0].url) : null;
}
export async function listOrders(limit = 200) {
  let orders = [];
  if (LOCAL) {
    let names = []; try { names = (await readdir(abs('pedidos'))).filter(n => n.endsWith('.json')); } catch { /* aún no hay pedidos */ }
    orders = await Promise.all(names.map(async n => JSON.parse(await readFile(abs('pedidos/' + n), 'utf8'))));
  } else {
    let cursor, blobs = [];
    do { const r = await list({ prefix: 'pedidos/', limit: 1000, cursor }); blobs.push(...r.blobs); cursor = r.hasMore ? r.cursor : null; } while (cursor);
    blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    orders = (await Promise.all(blobs.slice(0, limit).map(b => fetchJson(b.url).catch(() => null)))).filter(Boolean);
  }
  return orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

/* Comprobante de pago: imagen que sube el cliente (ya reducida en el navegador) */
export async function saveProof(order, dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Fail('Sube una imagen JPG, PNG o WebP');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 3 * 1024 * 1024) throw new Fail('La imagen es muy pesada (máximo 3 MB)');
  const magic = buf.subarray(0, 4).toString('hex');
  const ok = (m[1] === 'jpeg' && magic.startsWith('ffd8ff')) || (m[1] === 'png' && magic === '89504e47') || (m[1] === 'webp' && buf.subarray(0, 4).toString() === 'RIFF');
  if (!ok) throw new Fail('El archivo no es una imagen válida');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const path = `comprobantes/${order.code}-${randomBytes(4).toString('hex')}.${ext}`;
  if (LOCAL) { await mkdir(dirname(abs(path)), { recursive: true }); await writeFile(abs(path), buf); return '/.data/' + path; }
  const r = await put(path, buf, { access: 'public', addRandomSuffix: false, contentType: 'image/' + m[1] });
  return r.url;
}

/* ---------- cambios de estado ---------- */
export function pushStatus(o, status, note) {
  const at = new Date().toISOString();
  o.status = status;
  o.history.push({ status, at, note: note || '' });
  if (status === 'cancelled') { o.cancelledAt = at; o.cancelNote = note || ''; } else { delete o.cancelledAt; delete o.cancelNote; }
}
export async function setStatus(code, status, note) {
  if (!STATUSES.includes(status)) throw new Fail('Estado no válido');
  const o = await findOrder(code);
  if (!o) throw new Fail('Pedido no encontrado', 404);
  if (o.status === status) return o;
  pushStatus(o, status, note || 'Estado cambiado desde el panel');
  await saveOrder(o);
  return o;
}

/* ---------- aviso por correo al dueño (opcional: RESEND_API_KEY + ORDERS_NOTIFY_EMAIL) ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => 'S/ ' + Number(n).toFixed(2);
export async function notifyOwner(subject, o) {
  const key = process.env.RESEND_API_KEY, to = process.env.ORDERS_NOTIFY_EMAIL;
  if (!key || !to) return;
  const rows = o.items.map(i => `<li>${esc(i.name)}${i.opt ? ' (' + esc(i.opt) + ')' : ''} × ${i.qty} — ${money(i.price * i.qty)}</li>`).join('');
  const a = o.delivery.address;
  const html = `<h2>${esc(subject)} · ${esc(o.code)}</h2>
    <p><b>${esc(o.customer.name)}</b> · ${esc(o.customer.phone)}${o.customer.email ? ' · ' + esc(o.customer.email) : ''}</p>
    <ul>${rows}</ul>
    <p>Envío: ${money(o.totals.ship)}${o.totals.disc ? ' · Cupón ' + esc(o.totals.coupon) + ': −' + money(o.totals.disc) : ''}${o.totals.surcharge ? ' · Recargo tarjeta: ' + money(o.totals.surcharge) : ''}<br><b>Total: ${money(o.totals.total)}</b> · Pago: ${esc(o.pay.method)}</p>
    <p>${esc(o.delivery.label)}${o.delivery.ship !== 'pick' ? ': ' + esc([a.dir, a.distrito, a.prov, a.depto].filter(Boolean).join(', ')) : ''}</p>
    ${o.notes ? '<p>Nota: ' + esc(o.notes) + '</p>' : ''}${o.proof ? `<p><a href="${esc(o.proof.url)}">Ver comprobante</a></p>` : ''}`;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.ORDERS_FROM_EMAIL || 'Mamá Virtuosa <onboarding@resend.dev>', to: [to], subject: `${subject} · ${o.code}`, html })
    });
  } catch { /* un fallo de correo nunca bloquea el pedido */ }
}
