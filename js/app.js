(() => {
'use strict';
const C = window.MV_CONFIG, D = window.MV_DATA;
D.products = D.products.filter(p => p.active !== false);   // los productos ocultos desde el panel no existen para la tienda

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = n => 'S/ ' + n.toFixed(2);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const P = id => D.products.find(p => p.id === id);
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const catHref = (c, s) => '#/categoria/' + encodeURIComponent(c) + (s ? '/' + encodeURIComponent(s) : '');
const mmss = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } }
};

const main = $('#app');
let toastTimer;
function toast(msg, link) {
  const t = $('#toast');
  t.textContent = msg;
  if (link) { const a = document.createElement('a'); a.href = link.href; a.textContent = link.label; t.append(' ', a); }
  t.classList.toggle('has-link', !!link); t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), link ? 4500 : 2600);
}
function waLink(msg) {
  return 'https://wa.me/' + C.whatsapp + '?text=' + encodeURIComponent(msg || C.whatsappMsg);
}

/* ---------- carrito ---------- */
const MAX_QTY = 10;
const maxQty = () => MAX_QTY;
const r2 = n => Math.round(n * 100) / 100;
const validLine = l => { const p = l && P(l.id); return !!p && l.qty > 0 && (!p.opt || !p.opt.values || !p.opt.values.length || p.opt.values.includes(l.opt)); };
let cart = store.get('mv_cart', []).filter(validLine).map(l => ({ id: l.id, opt: l.opt || null, qty: Math.min(Math.floor(l.qty), maxQty(P(l.id))) }));
let coupon = store.get('mv_coupon', null);   // { code, type, value, min }: lo valida el servidor al aplicarlo y otra vez al confirmar
if (!coupon || typeof coupon !== 'object') coupon = null;
const saveCart = () => { store.set('mv_cart', cart); store.set('mv_coupon', coupon); updateCartCount(); };
let nudgeTimer;
function nudgeCart() {
  const b = $('.cart-btn'); if (!b) return;
  clearTimeout(nudgeTimer); b.classList.remove('nudge'); void b.offsetWidth; b.classList.add('nudge');
  nudgeTimer = setTimeout(() => b.classList.remove('nudge'), 6000);
}
$('.cart-btn').addEventListener('click', () => { clearTimeout(nudgeTimer); $('.cart-btn').classList.remove('nudge'); });
function updateCartCount() { $('#cart-count').textContent = cart.reduce((a, l) => a + l.qty, 0); }
/* devuelve true si se llegó al máximo disponible */
function addToCart(id, opt, qty) {
  const p = P(id), ex = cart.find(l => l.id === id && (l.opt || null) === (opt || null)), cap = maxQty(p);
  const want = (ex ? ex.qty : 0) + qty;
  if (ex) ex.qty = Math.min(cap, want); else cart.push({ id, opt: opt || null, qty: Math.min(cap, qty) });
  saveCart();
  return want > cap;
}

/* Medios de pago: los datos (número de Yape, cuenta, recargo) los edita el panel en Ajustes */
const PAYCFG = C.pay || {};
const PAY_META = {
  yape: { l: 'Yape / Plin', s: 'Pagas desde tu celular y subes la captura' },
  bank: { l: 'Transferencia bancaria (BCP)', s: 'Subes tu comprobante después de confirmar' },
  card: { l: 'Tarjeta crédito / débito', s: 'Te enviamos un link de pago por WhatsApp' }
};
const PICKUP = { l: 'Recojo en tienda', addr: 'Jr. San José #389 - Comas', map: 'https://maps.app.goo.gl/4xzChrczx9wF9VSY9' };
const mapLink = '<a href="' + PICKUP.map + '" target="_blank" rel="noopener">Ver ubicación en Google Maps</a>';
const payKeys = () => Object.keys(PAY_META).filter(k => !PAYCFG[k] || PAYCFG[k].on !== false);
const surchargePct = () => Number((PAYCFG.card && PAYCFG.card.surcharge) || 0);
const PAY_SHORT = { yape: 'Yape', bank: 'transferencia', card: 'tarjeta' };
const payNames = () => { const n = payKeys().map(k => PAY_SHORT[k]); if (payKeys().includes('yape')) n.splice(1, 0, 'Plin'); return n.join(', '); };

const shipOn = k => !!D.shipping[k] && D.shipping[k].on !== false;
const shipKeys = () => Object.keys(D.shipping).filter(shipOn);
const districts = () => D.districts || [];
const sendable = () => districts().filter(d => d.ship && d.cost !== null);
const districtOf = name => sendable().find(d => d.name === name);
/* Costo de envío; en Lima depende del distrito (null = aún no lo elige) */
function shipCost(sub, ship) {
  if (ship === 'lima') {
    if (C.freeShippingFrom > 0 && sub >= C.freeShippingFrom) return 0;
    const d = districtOf(ui.co.f.distrito);
    return d ? d.cost : null;
  }
  return D.shipping[ship].p;
}
const couponLabel = c => c.type === 'pct' ? `${c.value}% de descuento` : `S/ ${c.value} de descuento`;
function couponDisc(sub) {
  if (!coupon || (coupon.min && sub < coupon.min)) return 0;
  return r2(Math.min(sub, coupon.type === 'pct' ? sub * coupon.value / 100 : coupon.value));
}
function totals(ship, pay) {
  const sub = r2(cart.reduce((a, l) => a + P(l.id).price * l.qty, 0));
  const regular = r2(cart.reduce((a, l) => { const p = P(l.id); return a + (p.old > p.price ? p.old : p.price) * l.qty; }, 0));
  const count = cart.reduce((a, l) => a + l.qty, 0);
  const disc = couponDisc(sub);
  const shRaw = ship ? shipCost(sub, ship) : 0, sh = shRaw === null ? 0 : shRaw;
  const base = r2(sub - disc + sh);
  const sur = pay === 'card' && surchargePct() > 0 ? r2(base * surchargePct() / 100) : 0;
  return { sub, regular, savings: r2(regular - sub), count, disc, sh, shPending: shRaw === null, sur, total: r2(base + sur) };
}
async function shopApi(url, body) {
  let r;
  try { r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'mv-shop' }, body: JSON.stringify(body) }); }
  catch { throw new Error('No hay conexión. Revisa tu internet e intenta de nuevo.'); }
  let j = {}; try { j = await r.json(); } catch { /* sin cuerpo */ }
  if (!r.ok) throw new Error(j.error || 'No se pudo completar. Intenta de nuevo.');
  return j;
}
async function applyCoupon(raw) {
  const code = raw.trim().toUpperCase();
  if (!code) { coupon = null; ui.couponMsg = null; saveCart(); return; }
  try {
    const r = (await shopApi('/api/orders?op=coupon', { code, subtotal: totals().sub })).coupon;
    coupon = { code: r.code, type: r.type, value: r.value, min: r.min };
    ui.couponMsg = { ok: true, t: `Cupón ${r.code} aplicado: ${couponLabel(coupon)}` };
  } catch (e) { coupon = null; ui.couponMsg = { ok: false, t: e.message }; }
  saveCart();
}

/* ---------- estado de interfaz ---------- */
const ui = {
  pdp: { qty: 1, opt: null, img: 0 },
  co: { ship: Object.keys(D.shipping).find(k => D.shipping[k].on !== false) || 'lima', pay: payKeys()[0] || 'yape', f: (() => { const f = { ...store.get('mv_fields', {}) }; if (!f.name && (f.nombres || f.apellidos)) f.name = `${f.nombres || ''} ${f.apellidos || ''}`.trim(); delete f.nombres; delete f.apellidos; return f; })(), err: {}, agree: false, doc: false, busy: false },
  couponMsg: null,
  playing: null, elapsed: {}, topic: 'Todos', mega: null
};

/* ---------- piezas de HTML ---------- */
const pics = p => (p.imgs && p.imgs.length ? p.imgs : p.img ? [p.img] : []);
const imgOrLabel = (p, label) => pics(p).length
  ? `<img src="${esc(pics(p)[0])}" alt="${esc(p.name)}" loading="lazy">`
  : `<span aria-hidden="true">${label}</span>`;

/* Botón flotante sobre la foto (aparece al pasar el mouse o con el teclado). Si el producto tiene talla o color, lleva a su página para elegir */
const quickAdd = p => `<div class="qa">${p.opt && p.opt.values && p.opt.values.length
  ? `<a class="quick-add" href="#/producto/${p.id}">Elegir opciones</a>`
  : `<button type="button" class="quick-add" data-act="quick-add" data-id="${p.id}" aria-label="Agregar ${esc(p.name)} al carrito">Agregar al carrito</button>`}</div>`;
const card = (p, withCat) => `<div class="card-wrap"><a class="card" href="#/producto/${p.id}">
  <div class="ph${pics(p).length ? ' has-img' : ''}" style="background:${p.tone}">${imgOrLabel(p, '[foto producto]')}${p.tag ? `<span class="tag">${esc(p.tag)}</span>` : ''}</div>
  <div class="nm">${esc(p.name)}</div>${withCat ? `<div class="ct">${esc(p.cat)}</div>` : ''}
  <div class="pr"><b>${fmt(p.price)}</b>${p.old ? ` <s>${fmt(p.old)}</s>` : ''}</div></a>${quickAdd(p)}</div>`;

const crumbs = list => `<nav class="crumbs" aria-label="Ruta">${list.map(([l, h]) => h ? `<a href="${h}">${esc(l)}</a>` : `<span aria-current="page">${esc(l)}</span>`).join(' › ')}</nav>`;

/* Iconos de categoría (trazo, 48×48) */
const CAT_ICONS = {
  'Belleza': 'img/cat/belleza.png',
  'Bebé y niños': 'img/cat/bebe.png',
  'Ropa infantil': 'img/cat/ropa.png',
  'Gomitas saludables': 'img/cat/gomitas.png'
};
const CAT_ICON_DEFAULT = 'img/cat/ropa.png';
const catIcon = c => { const u = CAT_ICONS[c] || CAT_ICON_DEFAULT; return `<span class="cat-ico" style="-webkit-mask-image:url(${u});mask-image:url(${u})" aria-hidden="true"></span>`; };

/* ---------- hero (portada) y campañas de temporada ---------- */
const DEFAULT_HERO = {
  eyebrow: 'Nueva colección', title: 'Todo para mamá y sus peques',
  text: 'Belleza, básicos para niños, ropa, gomitas saludables y un podcast para acompañarte en la crianza.',
  cta1: { label: 'Comprar ahora', link: '#/categoria/Belleza' }, cta2: { label: '▶ Escuchar podcast', link: '#/podcast' },
  img: 'img/hero.jpg', imgM: 'img/hero-m.jpg', alt: 'Una mamá sonríe a su hija mientras le acomoda el cabello en un cuarto luminoso', pos: '60% 30%', bg: ''
};
const todayStr = () => new Date().toLocaleDateString('en-CA');
const heroLive = h => h && h.active !== false && (!h.start || h.start <= todayStr()) && (!h.end || h.end >= todayStr());
const activeHero = () => (D.heroes || []).find(heroLive) || { ...DEFAULT_HERO, ...(D.hero || {}) };
const SOON = C.podcastSoon !== false;   // Podcast "Próximamente"; poner podcastSoon:false en la configuración para activarlo
const isPodcastLink = l => /^#\/podcast/.test(l || '');
const SOON_TAG = '<small class="soon-tag">Próximamente</small>';
const safeLink = l => (/^(#|\/|https?:\/\/)/.test(l || '') ? l : '#/');
const heroBtn = (b, cls) => b && b.label && SOON && isPodcastLink(b.link) ? `<span class="btn${cls} soon" aria-disabled="true">🎙 Podcast ${SOON_TAG}</span>` : b && b.label ? `<a class="btn${cls}" href="${esc(safeLink(b.link))}"${/^https?:/.test(b.link || '') ? ' target="_blank" rel="noopener"' : ''}>${esc(b.label)}</a>` : '';
function heroHTML() {
  const h = activeHero();
  const img = h.img ? `<img src="${esc(h.img)}"${h.imgM ? ` srcset="${esc(h.imgM)} 800w, ${esc(h.img)} 1600w" sizes="(max-width:900px) 100vw, 50vw"` : ''} width="1600" height="900" alt="${esc(h.alt || '')}" fetchpriority="high"${h.pos ? ` style="object-position:${esc(h.pos)}"` : ''}>` : '';
  return `<section class="hero" aria-labelledby="hero-h"${h.bg ? ` style="background:${esc(h.bg)}"` : ''}>
  <div class="hero-txt">
    ${h.eyebrow ? `<div class="eyebrow">${esc(h.eyebrow)}</div>` : ''}
    <h1 id="hero-h">${esc(h.title)}</h1>
    ${h.text ? `<p>${esc(h.text)}</p>` : ''}
    <div class="ctas">${heroBtn(h.cta1, '')}${heroBtn(h.cta2, ' ghost')}</div>
  </div>
  <div class="hero-img">${img}</div>
</section>`;
}

/* ---------- inicio ---------- */
function pageHome() {
  const best = (D.featured || []).map(P).filter(Boolean).slice(0, 8);
  return {
    title: 'Mamá Virtuosa by Angie · Belleza, niños, ropa y gomitas',
    html: `
${heroHTML()}
<div class="trust"><div>🚚 Envíos a todo el Perú</div><div>🔒 Paga con ${esc(payNames())}</div><div>↺ Cambios hasta 7 días</div></div>
<section class="section" aria-labelledby="h-cat">
  <h2 class="sec-title" id="h-cat">Compra por categoría</h2>
  <div class="cat-grid">${D.catOrder.map(c => `<a class="cat-card" href="${catHref(c)}">
    <div class="ph" style="background:${D.catTone[c]}">${catIcon(c)}</div>
    <div class="nm">${esc(c)}</div><div class="sb">${esc(D.catSub[c])}</div></a>`).join('')}</div>
</section>
<section class="section s48" aria-labelledby="h-best">
  <div class="sec-head"><h2 class="sec-title" id="h-best">Más vendidos</h2><a class="link" href="#/mas-vendidos">Ver todo →</a></div>
  <div class="prod-grid">${best.map(p => card(p, true)).join('')}</div>
</section>
<section class="podcast-band" aria-labelledby="h-pod">
  <div class="ph cover"><span aria-hidden="true">${SOON ? 'Próximamente' : '[portada podcast]'}</span></div>
  <div>
    <div class="eyebrow">Podcast Mamá Virtuosa</div>
    ${SOON ? `<h2 id="h-pod">Próximamente</h2><p class="soon-note">Estamos preparando los primeros episodios. ¡Muy pronto podrás escucharlos aquí!</p>` : `<h2 id="h-pod">Últimos episodios</h2>
    <div class="ep-mini">${D.episodes.slice(0, 3).map(e => `<a href="#/podcast"><span class="dot-play" aria-hidden="true">▶</span><span><b>${esc(e.t)}</b><small>${esc(e.meta)}</small></span></a>`).join('')}</div>
    <a class="band-link" href="#/podcast">Ver todos los episodios →</a>`}
  </div>
</section>
<div class="home-end"></div>`
  };
}

/* ---------- listados (categoría, ofertas, búsqueda) ---------- */
let F = null;
const filtersOf = cat => (D.catFilters || {})[cat] || [];
const pvals = (p, f) => (p.f && p.f[f.id]) || [];
function initFilters(base, presetSub, filters = [], preset = null) {
  const prices = base.map(p => p.price);
  const lo = prices.length ? Math.floor(Math.min(...prices) / 10) * 10 : 0;
  const hi = prices.length ? Math.ceil(Math.max(...prices) / 10) * 10 : 100;
  F = { base, lo, hi, min: lo, max: hi, subs: new Set(presetSub ? [presetSub] : []), fl: filters,
    sel: Object.fromEntries(filters.map(f => [f.id, new Set(preset && preset.id === f.id ? [preset.value] : [])])),
    ages: new Set(), offers: false, sort: 'sales' };
}
function filtered() {
  const list = F.base.filter(p =>
    (!F.subs.size || F.subs.has(p.sub)) && F.fl.every(f => !F.sel[f.id].size || pvals(p, f).some(v => F.sel[f.id].has(v))) &&
    p.price >= F.min && p.price <= F.max &&
    (!F.ages.size || p.ages.some(a => F.ages.has(a))) && (!F.offers || p.old));
  const by = {
    sales: (a, b) => (F.rank ? F.rank.get(a.id) - F.rank.get(b.id) : (a.tag === 'Top' ? 0 : 1) - (b.tag === 'Top' ? 0 : 1)),
    new: (a, b) => (a.tag === 'Nuevo' ? 0 : 1) - (b.tag === 'Nuevo' ? 0 : 1),
    asc: (a, b) => a.price - b.price,
    desc: (a, b) => b.price - a.price
  };
  return list.sort(by[F.sort]);
}
function updateGrid(pending) {
  const grid = $('#grid'); if (!grid) return;
  const list = pending ? [] : filtered();
  $('#count').textContent = list.length + (list.length === 1 ? ' producto' : ' productos');
  grid.innerHTML = list.length ? list.map(p => card(p)).join('') :
    `<div class="empty"><div class="script">${pending ? 'Pronto sumaremos “' + esc(pending) + '”' : 'No encontramos productos'}</div>
     <p>${pending ? 'Estamos preparando esta sección.' : 'Prueba quitando algún filtro.'}</p>
     <a class="btn" href="#/">Volver al inicio</a></div>`;
  $$('[data-f=sub]').forEach(i => { i.checked = F.subs.has(i.value); });
  $$('[data-f=fopt]').forEach(i => { i.checked = F.sel[i.dataset.fid].has(i.value); });
  $$('[data-f=fall]').forEach(i => { i.checked = !F.sel[i.dataset.fid].size; });
  const all = $('[data-f=subs-all]'); if (all) all.checked = F.subs.size === 0;
  $('#min-out') && ($('#min-out').textContent = 'S/ ' + F.min);
  $('#max-out') && ($('#max-out').textContent = 'S/ ' + F.max);
}
function listPage({ title, crumbList, base, sub, pending, showSubs = true, filters = [], preset = null, rank = null }) {
  initFilters(base, sub, filters, preset);
  if (rank) F.rank = new Map(rank.map((id, i) => [id, i]));
  const subs = [...new Set(base.map(p => p.sub).filter(Boolean))];
  const hasAges = base.some(p => p.ages && p.ages.length);
  /* un bloque por cada filtro configurado en el panel; solo se listan las opciones que tienen productos */
  const filterHtml = filters.map(f => {
    const opts = f.options.map(o => [o, base.filter(p => pvals(p, f).includes(o)).length]).filter(x => x[1]);
    if (!opts.length) return '';
    return `<fieldset><legend>${esc(f.name)}</legend>
        <label class="chk"><input type="checkbox" data-f="fall" data-fid="${esc(f.id)}" checked> Todas</label>
        ${opts.map(([o, n]) => `<label class="chk"><input type="checkbox" data-f="fopt" data-fid="${esc(f.id)}" value="${esc(o)}"> ${esc(o)} <span class="cnt">${n}</span></label>`).join('')}</fieldset>`;
  }).join('');
  const html = `
<div class="cat-page">
  ${crumbs(crumbList)}
  <div class="cat-head">
    <div><h1>${esc(title)}</h1><div class="muted" id="count" aria-live="polite"></div></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="sort filter-toggle" data-act="filters-toggle" aria-expanded="false" aria-controls="filters">☰ Filtros</button>
      <label class="sort">Ordenar: <select data-f="sort" aria-label="Ordenar por">
        <option value="sales">Más vendidos</option><option value="new">Novedades</option>
        <option value="asc">Precio: menor a mayor</option><option value="desc">Precio: mayor a menor</option></select></label>
    </div>
  </div>
  <div class="cat-body">
    <form class="filters" id="filters" onsubmit="return false" aria-label="Filtros">
      ${filterHtml}
      ${showSubs && !filters.length && subs.length ? `<fieldset><legend>Subcategoría</legend>
        <label class="chk"><input type="checkbox" data-f="subs-all" checked> Todas</label>
        ${subs.map(s => `<label class="chk"><input type="checkbox" data-f="sub" value="${esc(s)}"> ${esc(s)}</label>`).join('')}</fieldset>` : ''}
      <fieldset><legend>Precio</legend>
        <div class="range">
          <input type="range" data-f="min" min="${F.lo}" max="${F.hi}" step="5" value="${F.min}" aria-label="Precio mínimo">
          <input type="range" data-f="max" min="${F.lo}" max="${F.hi}" step="5" value="${F.max}" aria-label="Precio máximo">
          <div class="vals"><span id="min-out"></span><span id="max-out"></span></div>
        </div></fieldset>
      ${hasAges ? `<fieldset><legend>Edad del niño</legend>
        <div class="age-chips">${['0–1', '1–3', '3–6'].map(a => `<label><input type="checkbox" data-f="age" value="${a}"><span>${a}</span></label>`).join('')}</div></fieldset>` : ''}
      <div><label class="chk"><input type="checkbox" data-f="offers"> Solo ofertas</label>
        <label class="chk"><input type="checkbox" checked disabled> Disponible</label></div>
    </form>
    <div class="prod-grid three" id="grid"></div>
  </div>
</div>`;
  return { title, html, after: () => updateGrid(pending) };
}
/* El segmento de la ruta puede ser «f~<id>~<opción>» (enlace exacto) o el nombre de una opción (enlaces antiguos del menú) */
function pageCategory(cat, seg) {
  if (!D.catOrder.includes(cat)) return pageNotFound();
  const base = D.products.filter(p => p.cat === cat), filters = filtersOf(cat);
  let preset = null;
  if (seg) {
    const m = /^f~([^~]+)~(.+)$/.exec(seg);
    if (m) {
      const f = filters.find(x => x.id === m[1]);
      if (f && f.options.includes(m[2])) preset = { id: f.id, value: m[2] };
    } else {
      const low = seg.toLowerCase(), f = filters.find(x => x.options.some(o => o.toLowerCase() === low));
      if (f) preset = { id: f.id, value: f.options.find(o => o.toLowerCase() === low) };
    }
  }
  const crumb = preset ? preset.value : (seg && !/^f~/.test(seg) ? seg : null);
  return listPage({
    title: crumb || cat,
    crumbList: [['Inicio', '#/'], [cat, crumb ? catHref(cat) : null], ...(crumb ? [[crumb]] : [])],
    base, filters, preset, pending: crumb && !preset ? crumb : null
  });
}
/* «Ver todo» de «Más vendidos» del inicio: los mismos productos destacados desde el panel, en el orden elegido */
function pageBest() {
  const base = (D.featured || []).map(P).filter(Boolean);
  return listPage({ title: 'Más vendidos', crumbList: [['Inicio', '#/'], ['Más vendidos']], base, rank: base.map(p => p.id) });
}
function pageOffers() {
  return listPage({ title: 'Ofertas', crumbList: [['Inicio', '#/'], ['Ofertas']], base: D.products.filter(p => p.old) });
}
function pageSearch(q) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  const base = D.products.filter(p => { const h = norm(p.name + ' ' + p.cat + ' ' + p.sub); return words.every(w => h.includes(w)); });
  return listPage({ title: 'Resultados para “' + q + '”', crumbList: [['Inicio', '#/'], ['Búsqueda']], base });
}

/* ---------- producto ---------- */
function pageProduct(id) {
  const p = P(+id); if (!p) return pageNotFound();
  ui.pdp = { qty: 1, opt: p.opt ? p.opt.values[0] : null, img: 0 };
  const others = D.products.filter(o => o.id !== p.id);
  const related = [...others.filter(o => o.cat === p.cat), ...others.filter(o => o.cat !== p.cat)].slice(0, 4);
  const gal = pics(p), n = gal.length || 3;
  const qtyCtl = cls => `<div class="qty ${cls || ''}"><button type="button" data-act="pdp-qty" data-d="-1" aria-label="Menos">–</button><output data-qty-out aria-live="polite">1</output><button type="button" data-act="pdp-qty" data-d="1" aria-label="Más">+</button></div>`;
  const html = `
<div class="pdp">
  ${crumbs([['Inicio', '#/'], [p.cat, catHref(p.cat)], [p.name]])}
  <div class="pdp-grid">
    <div class="thumbs">
      ${Array.from({ length: n }, (_, i) => `<button class="thumb ph${gal[i] ? ' has-img' : ''}" data-act="pdp-img" data-i="${i}" style="background:${p.tone}" aria-label="Ver foto ${i + 1}">${gal[i] ? `<img src="${esc(gal[i])}" alt="">` : ''}</button>`).join('')}
      <button class="thumb video" data-act="toast" data-msg="El video estará disponible pronto">▶ video</button>
    </div>
    <div>
      <div class="main-img ph${gal.length ? ' has-img' : ''}" id="main-img" style="background:${p.tone}">${gal.length ? `<img id="main-pic" src="${esc(gal[0])}" alt="${esc(p.name)}">` : '<span id="main-lbl">[foto principal]</span>'}</div>
      <div class="dots" aria-label="Fotos">${Array.from({ length: n }, (_, i) => i).map(i =>`<button data-act="pdp-img" data-i="${i}" aria-label="Foto ${i + 1}"></button>`).join('')}</div>
    </div>
    <div class="info">
      <div class="eyebrow">${esc(p.cat)}</div>
      <h1>${esc(p.name)}</h1>
      <div class="price">${fmt(p.price)}${p.old ? `<s>${fmt(p.old)}</s>` : ''}</div>
      <div class="muted" style="font-size:14px">Paga con ${esc(payNames())}.</div>
      ${p.opt ? `<div><div class="opt-head"><span>${esc(p.opt.label)}</span>${p.opt.label === 'Talla' ? '<button class="link ul" data-act="toast" data-msg="La guía de tallas estará disponible pronto">Guía de tallas</button>' : ''}</div>
        <div class="opts" role="group" aria-label="${esc(p.opt.label)}">${p.opt.values.map(v => `<button class="opt" data-act="pdp-opt" data-v="${esc(v)}" aria-pressed="false">${esc(v)}</button>`).join('')}</div></div>` : ''}
      <div class="buy-row desk">${qtyCtl()}<button class="btn" data-act="pdp-add">Agregar al carrito</button></div>
      <button class="btn ghost" data-act="pdp-buy">Comprar ahora</button>
      <button class="btn wa" data-act="wa" data-msg="${esc('Hola Angie, me interesa: ' + p.name)}">💬 Consultar por WhatsApp</button>
      <div class="perks">🚚 Lima 2–4 días · provincias 4–7 días<br>↺ Cambios hasta 7 días<br>✔ Disponible</div>
      <div class="acc">
        <details open><summary>Descripción</summary><p>${esc(p.desc)}</p></details>
        ${p.care ? `<details><summary>Medidas y cuidados</summary><p>${esc(p.care)}</p></details>` : ''}
        <details><summary>Envíos y cambios</summary><p>Delivery en Lima en 2–4 días hábiles y a provincias en 4–7 días. Cambios hasta 7 días después de recibir tu pedido.</p></details>
      </div>
    </div>
  </div>
  <h2 class="related">Completa el look</h2>
  <div class="related-grid">${related.map(r => card(r)).join('')}</div>
  <div class="mbar">${qtyCtl()}<button class="btn" data-act="pdp-add">Agregar al carrito</button></div>
</div>`;
  return { title: p.name, html, after: syncPDP };
}
function syncPDP() {
  $$('[data-qty-out]').forEach(o => { o.textContent = ui.pdp.qty; });
  $$('[data-act=pdp-opt]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === ui.pdp.opt));
  $$('.thumbs .thumb:not(.video)').forEach((t, i) => t.classList.toggle('on', i === ui.pdp.img));
  $$('.dots button').forEach((t, i) => t.classList.toggle('on', i === ui.pdp.img));
  const l = $('#main-lbl'); if (l) l.textContent = '[foto principal ' + (ui.pdp.img + 1) + ']';
  const m = $('#main-pic'), g = pics(P(currentProductId()) || {});
  if (m && g[ui.pdp.img]) m.src = g[ui.pdp.img];
}
function currentProductId() { return +parseHash()[1]; }

/* ---------- carrito (página) ---------- */
function lineLabel(l) { const p = P(l.id); return l.opt ? `${p.opt ? p.opt.label + ' ' : ''}${l.opt}` : p.cat; }
const payLine = () => `🔒 Paga con ${payNames()}`;
const couponBox = () => `<form class="coupon" data-form="coupon"><input name="code" placeholder="Cupón de descuento" aria-label="Cupón de descuento" autocomplete="off" value="${esc(coupon ? coupon.code : '')}"><button type="submit">Aplicar</button></form>
    ${ui.couponMsg ? `<div class="coupon-msg ${ui.couponMsg.ok ? 'ok' : 'bad'}" role="status">${esc(ui.couponMsg.t)}</div>` : ''}
    ${coupon && coupon.min && totals().sub < coupon.min ? `<div class="coupon-msg bad" role="status">El cupón ${esc(coupon.code)} aplica desde ${fmt(coupon.min)} en productos.</div>` : ''}`;
function cartView() {
  const t = totals();
  const free = C.freeShippingFrom > 0 && shipOn('lima');
  const need = Math.max(0, C.freeShippingFrom - t.sub);
  const pct = Math.min(100, t.sub / (C.freeShippingFrom || 1) * 100).toFixed(0);
  let body;
  if (!cart.length) {
    body = `<div class="empty-cart"><div class="script">Tu carrito está vacío</div><a class="btn" href="#/">Seguir comprando</a></div>`;
  } else {
    body = `<div class="cart-grid">
  <div>
    ${free ? `<div class="free-bar" role="status">${need > 0 ? `Te faltan <b>${fmt(need)}</b> para envío gratis en Lima` : '¡Tienes envío gratis en Lima!'}<div class="track"><div class="fill" style="width:${pct}%"></div></div></div>` : ''}
    <div class="lines">${cart.map((l, i) => { const p = P(l.id), cap = maxQty(p); return `<div class="line">
      <div class="ph${pics(p)[0] ? ' has-img' : ''}" style="background:${p.tone}">${pics(p)[0] ? `<img src="${esc(pics(p)[0])}" alt="">` : ''}</div>
      <div><a class="nm" href="#/producto/${p.id}" style="color:inherit">${esc(p.name)}</a><div class="un">${esc(lineLabel(l))} · ${fmt(p.price)} c/u</div>
        <button class="link ul" data-act="line-rm" data-i="${i}">Quitar</button></div>
      <div class="qty sm"><button data-act="line-qty" data-i="${i}" data-d="-1" aria-label="Menos" ${l.qty <= 1 ? 'disabled' : ''}>–</button><b>${l.qty}</b><button data-act="line-qty" data-i="${i}" data-d="1" aria-label="Más" ${l.qty >= cap ? 'disabled' : ''}>+</button></div>
      <div class="tot">${fmt(p.price * l.qty)}</div></div>`; }).join('')}</div>
    <a class="link" href="#/" style="display:inline-block;margin-top:18px">← Seguir comprando</a>
  </div>
  <aside class="summary" aria-label="Resumen">
    <h2>Resumen</h2>
    ${couponBox()}
    <div class="srow"><span>Subtotal</span><span>${fmt(t.sub)}</span></div>
    ${t.savings ? `<div class="srow disc"><span>Ya ahorras en ofertas</span><span>${fmt(t.savings)}</span></div>` : ''}
    ${t.disc ? `<div class="srow disc"><span>Cupón ${esc(coupon.code)}</span><span>− ${fmt(t.disc)}</span></div>` : ''}
    <div class="srow"><span>Envío</span><span class="muted">se calcula al pagar</span></div>
    <div class="srow total"><span>Total</span><span>${fmt(t.total)}</span></div>
    <a class="btn block" href="#/checkout">Finalizar compra</a>
    <div class="safe">${esc(payLine())}</div>
  </aside>
</div>`;
  }
  return `<div class="cart-page"><h1>Tu carrito <span>${t.count} ${t.count === 1 ? 'producto' : 'productos'}</span></h1>${body}</div>`;
}
function pageCart() { return { title: 'Tu carrito', html: cartView() }; }

/* ---------- checkout (una sola página: datos, entrega y pago) ---------- */
const FIELDS = {
  name: { l: 'Nombres y apellidos', ac: 'name' },
  phone: { l: 'Celular (WhatsApp)', type: 'tel', ac: 'tel-national', test: v => /^\d{9}$/.test(v.replace(/\s/g, '')), msg: 'Ingresa un celular de 9 dígitos' },
  email: { l: 'Correo (opcional)', type: 'email', ac: 'email', opt: true, test: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), msg: 'Ingresa un correo válido' },
  depto: { l: 'Departamento', ac: 'address-level1' },
  prov: { l: 'Provincia', ac: 'address-level2' },
  distrito: { l: 'Distrito', ac: 'address-level3' },
  dir: { l: 'Dirección y número', ac: 'street-address' },
  ref: { l: 'Referencia (opcional)', opt: true },
  dni: { l: 'DNI', ac: 'off', test: v => /^\d{8}$/.test(v), msg: 'El DNI tiene 8 dígitos' },
  notes: { l: 'Nota para tu pedido (opcional)', opt: true, area: true, max: 300 }
};
const applies = k => {
  const st = ui.co;
  if (k === 'depto' || k === 'prov') return st.ship === 'prov';
  if (k === 'distrito' || k === 'dir' || k === 'ref') return st.ship !== 'pick';
  if (k === 'dni') return st.doc;
  return true;
};
const fieldError = k => {
  const d = FIELDS[k], v = (ui.co.f[k] || '').trim();
  if (k === 'distrito' && ui.co.ship === 'lima') return !v ? 'Elige tu distrito' : districtOf(v) ? '' : 'Elige un distrito con reparto';
  if (!v) return d.opt ? '' : 'Completa este campo';
  return d.test && !d.test(v) ? d.msg : '';
};
const fld = (k, extra = '', label) => {
  const d = FIELDS[k], v = ui.co.f[k] || '', e = ui.co.err[k];
  const attrs = `id="f-${k}" name="${k}" data-co="${k}" autocomplete="${d.ac || 'off'}"${d.opt ? '' : ' aria-required="true"'}${e ? ' aria-invalid="true"' : ''} aria-describedby="e-${k}"`;
  return `<div class="fld ${e ? 'err' : ''} ${extra}" data-fld="${k}"><label for="f-${k}">${label || d.l}${d.opt ? '' : '<span class="req" aria-hidden="true"> *</span>'}</label>
    ${d.area ? `<textarea ${attrs} rows="2" maxlength="${d.max}">${esc(v)}</textarea>` : `<input ${attrs} type="${d.type || 'text'}" value="${esc(v)}"${d.type === 'tel' ? ' inputmode="numeric"' : ''}>`}
    <div class="msg" id="e-${k}">${e ? esc(e) : ''}</div></div>`;
};
const money0 = n => 'S/ ' + (Number.isInteger(n) ? n : n.toFixed(2));
function districtSelect() {
  const v = ui.co.f.distrito || '', e = ui.co.err.distrito;
  const opt = d => `<option value="${esc(d.name)}"${d.name === v ? ' selected' : ''}${d.ship && d.cost !== null ? '' : ' disabled'}>${esc(d.name)} — ${d.ship && d.cost !== null ? money0(d.cost) : 'sin reparto'}</option>`;
  const group = z => `<optgroup label="${z === 'Callao' ? 'Callao' : 'Lima Metropolitana'}">${districts().filter(d => d.zone === z).map(opt).join('')}</optgroup>`;
  return `<div class="fld ${e ? 'err' : ''}" data-fld="distrito"><label for="f-distrito">Distrito<span class="req" aria-hidden="true"> *</span></label>
    <select id="f-distrito" name="distrito" data-co="distrito" autocomplete="address-level3" aria-required="true"${e ? ' aria-invalid="true"' : ''} aria-describedby="e-distrito">
      <option value=""${v ? '' : ' selected'}>Elige tu distrito</option>${group('Lima')}${group('Callao')}</select>
    <div class="msg" id="e-distrito">${e ? esc(e) : ''}</div>
    <div class="hint">¿Tu distrito no aparece? <a href="#" data-act="wa" data-msg="Hola Angie, quisiera consultar si hacen delivery a mi distrito.">Consúltanos por WhatsApp</a>.</div></div>`;
}
function showErr(k, msg) {
  const w = $(`[data-fld="${k}"]`); if (!w) return;
  w.classList.toggle('err', !!msg); $('.msg', w).textContent = msg || '';
  const i = $('input,textarea,select', w); if (msg) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid');
}
function validateAll() {
  const st = ui.co, err = {};
  Object.keys(FIELDS).forEach(k => { if (!applies(k)) return; const m = fieldError(k); if (m) err[k] = m; });
  st.err = err;
  return Object.keys(err);
}
function choiceHTML(kind, entries, selected) {
  return `<div role="radiogroup" class="choices">${entries.map(e => `<button type="button" class="choice" role="radio" aria-checked="${selected === e.k}" data-act="pick-${kind}" data-k="${e.k}"${e.dis ? ' disabled' : ''}>
      <span class="rd"></span><span class="tx"><b>${esc(e.l)}</b><small>${esc(e.s)}</small></span>${e.price ? `<b>${esc(e.price)}</b>` : ''}</button>`).join('')}</div>`;
}
function payNote(t) {
  const st = ui.co, pct = surchargePct();
  const m = {
    yape: 'Al confirmar verás el número y el QR de Yape / Plin. Pagas desde tu celular y subes la captura para validar tu pago.',
    bank: 'Al confirmar verás los datos de la cuenta. Haces la transferencia y subes tu comprobante para validar tu pago.',
    card: `Al confirmar te enviamos un link de pago seguro por WhatsApp.${pct > 0 ? ` Este medio tiene un recargo de ${pct}% (${fmt(t.sur)} en este pedido).` : ''}`
  };
  return `<div class="pay-note">${m[st.pay] || ''}</div>`;
}
function summaryHTML(inner) {
  const st = ui.co, t = totals(st.ship, st.pay);
  const rows = cart.map((l, i) => { const p = P(l.id), cap = maxQty(p); return `<div class="sum-line"><div class="ph${pics(p)[0] ? ' has-img' : ''}" style="background:${p.tone}">${pics(p)[0] ? `<img src="${esc(pics(p)[0])}" alt="">` : ''}</div>
    <div class="t"><b>${esc(p.name)}</b>${l.opt ? `<br><span class="muted">${esc(l.opt)}</span>` : ''}
      <div class="qty sm mini"><button type="button" data-act="line-qty" data-i="${i}" data-d="-1" aria-label="Menos de ${esc(p.name)}" ${l.qty <= 1 ? 'disabled' : ''}>–</button><b>${l.qty}</b><button type="button" data-act="line-qty" data-i="${i}" data-d="1" aria-label="Más de ${esc(p.name)}" ${l.qty >= cap ? 'disabled' : ''}>+</button></div></div><b>${fmt(p.price * l.qty)}</b></div>`; }).join('');
  return `${inner ? '' : '<h2>Resumen del pedido</h2>'}${rows}
    ${couponBox()}
    ${t.savings ? `<div class="srow muted" style="border-top:1px solid var(--line);padding-top:12px"><span>Precio regular</span><s>${fmt(t.regular)}</s></div>` : ''}
    <div class="srow"${t.savings ? '' : ' style="border-top:1px solid var(--line);padding-top:12px"'}><span>Subtotal</span><span>${fmt(t.sub)}</span></div>
    ${t.disc ? `<div class="srow disc"><span>Cupón ${esc(coupon.code)}</span><span>− ${fmt(t.disc)}</span></div>` : ''}
    <div class="srow"><span>Envío</span><span>${t.shPending ? '<span class="muted">Elige tu distrito</span>' : t.sh === 0 ? 'Gratis' : fmt(t.sh)}</span></div>
    ${t.sur ? `<div class="srow"><span>Recargo tarjeta (${surchargePct()}%)</span><span>${fmt(t.sur)}</span></div>` : ''}
    <div class="srow total"><span>Total</span><span>${fmt(t.total)}</span></div>
    ${t.savings + t.disc > 0 ? `<div class="save-note">¡Ahorras ${fmt(r2(t.savings + t.disc))} en esta compra!</div>` : ''}
    <div class="safe">${esc(payLine())}</div>`;
}
function checkoutView() {
  const st = ui.co, t = totals(st.ship, st.pay);
  const minLima = sendable().length ? Math.min(...sendable().map(d => d.cost)) : 0;
  if (!shipOn(st.ship)) st.ship = shipKeys()[0] || st.ship;
  const shipEntries = shipKeys().map(k => {
    const o = D.shipping[k], c = shipCost(t.sub, k);
    if (k === 'pick') return { k, l: PICKUP.l, s: PICKUP.addr, price: 'Gratis' };
    return { k, l: o.l, s: o.s, price: c === 0 ? 'Gratis' : c === null ? 'Desde ' + money0(minLima) : fmt(c) };
  });
  const payEntries = payKeys().map(k => ({ k, l: PAY_META[k].l, s: PAY_META[k].s, price: k === 'card' && surchargePct() > 0 ? '+' + surchargePct() + '%' : '' }));
  const mSum = `<details class="sum-m"><summary><span>Resumen del pedido (${t.count})</span><b>${fmt(t.total)} ⌄</b></summary><div class="in">${summaryHTML(true)}</div></details>`;
  return `<div class="co-page"><h1 class="sr">Finalizar compra</h1>
    <a class="link" href="#/carrito">← Volver al carrito</a>
    <div style="height:18px"></div>${mSum}
    <div class="co-grid"><form class="form" data-form="order" novalidate>
      <section class="co-card" aria-labelledby="h-datos"><h2 id="h-datos"><i>1</i>Tus datos</h2>
        <p class="req-note">Los campos con <span class="req">*</span> son obligatorios.</p>
        ${fld('name')}
        <div class="row2">${fld('phone')}${fld('email')}</div>
        <label class="chk-line"><input type="checkbox" data-co-check="doc"${st.doc ? ' checked' : ''}> Necesito boleta</label>
        ${st.doc ? fld('dni') : ''}</section>
      <section class="co-card" aria-labelledby="h-entrega"><h2 id="h-entrega"><i>2</i>Entrega</h2>
        ${choiceHTML('ship', shipEntries, st.ship)}
        ${st.ship === 'pick' ? `<div class="pay-note">Recoge tu pedido en <b>${PICKUP.addr}</b>. ${mapLink}<br>No necesitas ingresar dirección; te avisaremos por WhatsApp cuando esté listo.</div>` :
          st.ship === 'prov' ? `<div class="row2">${fld('depto')}${fld('prov')}</div>${fld('distrito')}${fld('dir', '', 'Agencia y dirección de entrega')}${fld('ref')}` :
          `${districtSelect()}${fld('dir')}${fld('ref')}`}</section>
      <section class="co-card" aria-labelledby="h-pago"><h2 id="h-pago"><i>3</i>Forma de pago</h2>
        ${choiceHTML('pay', payEntries, st.pay)}${payNote(t)}</section>
      <section class="co-card" aria-label="Detalles adicionales">
        ${fld('notes')}
        <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <label class="chk-line"><input type="checkbox" data-co-check="agree" id="agree"${st.agree ? ' checked' : ''}> Acepto los términos, la política de privacidad y la política de cambios</label>
        <div class="fld ${st.err.agree ? 'err' : ''}"><div class="msg" id="e-agree" role="alert">${st.err.agree ? esc(st.err.agree) : ''}</div></div></section>
      <div class="form-err" id="co-err" role="alert"></div>
      <button class="btn block big" type="submit" id="co-submit">Confirmar pedido · ${fmt(t.total)}</button>
    </form>
    <aside class="summary co-side" aria-label="Resumen del pedido">${summaryHTML()}</aside></div></div>`;
}
function pageCheckout() {
  if (!cart.length) { location.replace('#/carrito'); return null; }
  if (!shipOn(ui.co.ship)) ui.co.ship = shipKeys()[0] || ui.co.ship;
  return { title: 'Finalizar compra', html: checkoutView() };
}
function setBusy(on) {
  ui.co.busy = on;
  const b = $('#co-submit'); if (!b) return;
  b.disabled = on; b.setAttribute('aria-busy', on);
  b.textContent = on ? 'Enviando tu pedido…' : 'Confirmar pedido · ' + fmt(totals(ui.co.ship, ui.co.pay).total);
}
async function submitOrder(form) {
  const st = ui.co;
  if (st.busy) return;
  const bad = validateAll();
  st.err.agree = st.agree ? '' : 'Debes aceptar los términos para continuar';
  if (bad.length || !st.agree) {
    render(true);
    const n = bad.length ? $('#f-' + bad[0]) : $('#agree'); if (n) n.focus();
    return;
  }
  $('#co-err').textContent = '';
  const f = st.f, g = k => (f[k] || '').trim();
  const body = {
    name: g('name'), phone: g('phone').replace(/\s/g, ''), email: g('email'),
    items: cart.map(l => ({ id: l.id, opt: l.opt, qty: l.qty })),
    ship: st.ship, address: { depto: g('depto'), prov: g('prov'), distrito: g('distrito'), dir: g('dir'), ref: g('ref') },
    pay: st.pay, coupon: coupon ? coupon.code : '',
    doc: st.doc ? { type: 'boleta', dni: g('dni') } : null,
    notes: g('notes'), website: form.elements.website.value
  };
  const total = totals(st.ship, st.pay).total;
  setBusy(true);
  try {
    const r = await shopApi('/api/orders', body);
    const mine = store.get('mv_orders', []).filter(o => o.code !== r.code);
    mine.unshift({ code: r.code, token: r.token, at: Date.now(), total });
    store.set('mv_orders', mine.slice(0, 20));
    const keep = { ...f }; delete keep.notes; delete keep.dni;
    store.set('mv_fields', keep);
    prefetched = r.order ? { code: r.code, token: r.token, order: r.order } : null;
    try { sessionStorage.setItem('mv_fresh', r.code); } catch { /* sin almacenamiento */ }
    cart = []; coupon = null; ui.couponMsg = null; saveCart();
    st.agree = false; st.err = {}; st.f.notes = '';
    location.hash = `#/pedido/${r.code}/${r.token}`;
  } catch (e) {
    setBusy(false);
    const box = $('#co-err'); box.textContent = e.message; box.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

/* ---------- pedido (seguimiento, instrucciones de pago y comprobante) ---------- */
const ORDER_FLOW = ['pending', 'review', 'paid', 'preparing', 'ready', 'delivered'];
const flowOf = o => o.pay.method === 'card' ? ['pending', 'paid', 'preparing', 'ready', 'delivered'] : ORDER_FLOW;
const stepLabel = (o, s) => ({
  pending: 'Esperando pago', review: 'Comprobante en revisión', paid: 'Pago confirmado', preparing: 'En preparación',
  ready: o.delivery.ship === 'pick' ? 'Listo para recoger' : 'En camino', delivered: 'Entregado', cancelled: 'Cancelado'
})[s];
const when = iso => new Date(iso).toLocaleString('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const statusAt = (o, s) => { const h = [...o.history].reverse().find(x => x.status === s); return h ? h.at : null; };
function orderWa(o, extra) {
  const lines = o.items.map(i => `• ${i.name}${i.opt ? ' (' + i.opt + ')' : ''} × ${i.qty}`).join('\n');
  return `Hola Angie, soy ${o.customer.name}. Mi pedido es ${o.code} por ${fmt(o.totals.total)}:\n${lines}\nPago: ${PAY_META[o.pay.method].l}.${extra ? '\n' + extra : ''}`;
}
const copyRow = (label, value) => value ? `<div class="copy-row"><span>${esc(label)}</span><b>${esc(value)}</b><button type="button" class="link ul" data-act="copy" data-v="${esc(value)}">Copiar</button></div>` : '';
function payPanel(o) {
  const m = o.pay.method, cfg = PAYCFG[m] || {}, tot = fmt(o.totals.total);
  const waAsk = txt => `<button class="btn wa" data-act="wa" data-msg="${esc(orderWa(o, txt))}">💬 ${m === 'card' ? 'Pedir mi link de pago' : 'Pedir los datos por WhatsApp'}</button>`;
  if (o.status === 'cancelled') return '';
  const paid = ORDER_FLOW.indexOf(o.status) >= 2;
  if (paid) return `<section class="ord-card ok"><h2>✓ Pago confirmado</h2><p>¡Gracias! Ya estamos preparando tu pedido.</p></section>`;
  if (m === 'card') return `<section class="ord-card"><h2>Pago con tarjeta</h2>
    <p>Total a pagar: <b>${tot}</b>${o.totals.surcharge ? ` (incluye recargo de ${fmt(o.totals.surcharge)})` : ''}. Te enviaremos un link de pago seguro por WhatsApp para que pagues con tu tarjeta.</p>
    ${waAsk('Quiero pagar con tarjeta, por favor envíame el link de pago.')}</section>`;
  const info = m === 'yape'
    ? (cfg.number || cfg.qr ? `${copyRow('Número', cfg.number)}${copyRow('Titular', cfg.holder)}${cfg.qr ? `<img class="qr" src="${esc(cfg.qr)}" alt="Código QR de Yape">` : ''}` : '')
    : (cfg.account || cfg.cci ? `${copyRow('Banco', cfg.bank)}${copyRow('Cuenta', cfg.account)}${copyRow('CCI', cfg.cci)}${copyRow('Titular', cfg.holder)}` : '');
  return `<section class="ord-card"><h2>${m === 'yape' ? 'Paga con Yape o Plin' : 'Paga por transferencia (BCP)'}</h2>
    <p>Monto exacto: <b class="amt">${tot}</b></p>
    ${info || `<p class="muted">Te enviamos los datos de pago por WhatsApp.</p>${waAsk('Quiero pagar, por favor envíame los datos de pago.')}`}
    ${o.status === 'review' && o.proof ? `<div class="proof-ok">✓ Recibimos tu comprobante el ${esc(when(o.proof.at))}. Lo estamos revisando; te avisaremos por WhatsApp.</div>` : ''}
    <div class="proof">
      <label class="btn${o.status === 'review' ? ' ghost' : ''}" id="proof-btn"><span>${o.status === 'review' ? 'Subir otro comprobante' : '📎 Subir comprobante de pago'}</span><input type="file" accept="image/*" data-proof hidden></label>
      <span class="muted small">Sube la captura o foto de tu pago (JPG, PNG o WebP).</span></div></section>`;
}
function trackHTML(o) {
  if (o.status === 'cancelled') return `<div class="cancel-note"><b>Pedido cancelado.</b> ${o.cancelNote ? esc(o.cancelNote) + '. ' : ''}Si ya habías pagado, escríbenos por WhatsApp para devolverte tu dinero.</div>`;
  const rank = ORDER_FLOW.indexOf(o.status), flow = flowOf(o);
  let cur = 0; flow.forEach((s, i) => { if (ORDER_FLOW.indexOf(s) <= rank) cur = i; });
  const last = flow[cur] === 'delivered';
  return `<ol class="track-list" aria-label="Estado del pedido">${flow.map((s, i) => { const at = statusAt(o, s), done = i < cur || (i === cur && last);
    return `<li class="${done ? 'is-done' : i === cur ? 'is-cur' : ''}"${i === cur ? ' aria-current="step"' : ''}><i aria-hidden="true">${done ? '✓' : i + 1}</i><span>${esc(stepLabel(o, s))}</span>${at && i <= cur ? `<small>${esc(when(at))}</small>` : ''}</li>`; }).join('')}</ol>`;
}
function orderHTML(o, fresh) {
  const t = o.totals, d = o.delivery;
  return `<div class="ord-head">${fresh ? '<div class="check" aria-hidden="true">✓</div>' : ''}
      <h1 class="script">${fresh ? '¡Gracias por tu pedido, ' + esc(o.customer.name.split(' ')[0]) + '!' : 'Tu pedido'}</h1>
      <div class="muted">Pedido <b class="code">${esc(o.code)}</b> · ${esc(when(o.createdAt))}</div></div>
    <div class="ord-grid"><div class="ord-main">
      <section class="ord-card"><h2>Estado</h2>${trackHTML(o)}</section>
      ${payPanel(o)}
      <section class="ord-card"><h2>Entrega</h2><p><b>${esc(d.ship === 'pick' ? PICKUP.l : d.label)}</b>${d.district ? ' · ' + esc(d.district) : ''}<br><span class="muted">${d.ship === 'pick' ? `Recoge en ${PICKUP.addr}. ${mapLink}<br>Te avisaremos por WhatsApp cuando esté listo.` : 'Plazo estimado: ' + esc(d.eta) + ' desde la confirmación del pago.'}</span></p></section>
    </div>
    <aside class="summary" aria-label="Resumen del pedido"><h2>Resumen</h2>
      ${o.items.map(i => `<div class="sum-line"><div class="ph${i.img ? ' has-img' : ''}">${i.img ? `<img src="${esc(i.img)}" alt="">` : ''}</div><div class="t"><b>${esc(i.name)}</b><br><span class="muted">${i.opt ? esc(i.opt) + ' · ' : ''}Cant. ${i.qty}</span></div><b>${fmt(i.price * i.qty)}</b></div>`).join('')}
      <div class="srow" style="border-top:1px solid var(--line);padding-top:12px"><span>Subtotal</span><span>${fmt(t.sub)}</span></div>
      ${t.disc ? `<div class="srow disc"><span>Cupón ${esc(t.coupon)}</span><span>− ${fmt(t.disc)}</span></div>` : ''}
      <div class="srow"><span>Envío</span><span>${t.ship === 0 ? 'Gratis' : fmt(t.ship)}</span></div>
      ${t.surcharge ? `<div class="srow"><span>Recargo tarjeta (${t.surchargePct}%)</span><span>${fmt(t.surcharge)}</span></div>` : ''}
      <div class="srow total"><span>Total</span><span>${fmt(t.total)}</span></div>
      <button class="btn wa block" data-act="wa" data-msg="${esc(orderWa(o, 'Tengo una consulta sobre mi pedido.'))}">💬 Consultar por WhatsApp</button>
      <button class="link" data-act="order-refresh">↻ Actualizar estado</button>
      <a class="link" href="#/">← Seguir comprando</a>
    </aside></div>`;
}
let ordCtx = null, prefetched = null;
async function loadOrder(code, token, fresh) {
  const box = $('#ord-box'); if (!box) return;
  let o;
  if (prefetched && prefetched.code === code && prefetched.token === token) { o = prefetched.order; prefetched = null; }
  else try {
    const r = await fetch(`/api/orders?c=${encodeURIComponent(code)}&t=${encodeURIComponent(token)}`, { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'No encontramos este pedido');
    o = j.order;
  } catch (e) {
    if ($('#ord-box') !== box) return;
    box.innerHTML = `<div class="empty-cart"><div class="script">${esc(e instanceof TypeError ? 'No hay conexión' : e.message)}</div><p class="muted">Revisa el enlace de tu pedido o escríbenos por WhatsApp.</p><a class="btn" href="#/">Ir al inicio</a></div>`;
    return;
  }
  if ($('#ord-box') !== box) return;
  ordCtx = { code, token, o, fresh };
  box.innerHTML = orderHTML(o, fresh);
  document.title = 'Pedido ' + o.code + ' · Mamá Virtuosa';
}
function pageOrder(code, token) {
  let fresh = false;
  try { fresh = sessionStorage.getItem('mv_fresh') === code; if (fresh) sessionStorage.removeItem('mv_fresh'); } catch { /* sin almacenamiento */ }
  return { title: 'Tu pedido', html: `<div class="ord-page" id="ord-box"><div class="ord-loading" role="status">Cargando tu pedido…</div></div>`, after: () => loadOrder(code, token, fresh) };
}
function pageMyOrders() {
  const mine = store.get('mv_orders', []);
  return { title: 'Mis pedidos', html: `<div class="ord-page"><h1 class="script">Mis pedidos</h1>
    ${mine.length ? `<p class="muted">Pedidos hechos desde este dispositivo.</p><div class="my-orders">${mine.map(o => `<a class="my-order" href="#/pedido/${esc(o.code)}/${esc(o.token)}"><b>${esc(o.code)}</b><span class="muted">${esc(new Date(o.at).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' }))}</span><b>${fmt(o.total)}</b><span aria-hidden="true">→</span></a>`).join('')}</div>`
      : `<div class="empty-cart"><div class="script">Aún no tienes pedidos aquí</div><p class="muted">Cuando compres, tu pedido aparecerá en esta lista. Si compraste desde otro dispositivo, usa el enlace que te dimos al confirmar.</p><a class="btn" href="#/">Ir a la tienda</a></div>`}</div>` };
}
async function sendProof(file) {
  const btn = $('#proof-btn'), o = ordCtx; if (!file || !o || !btn) return;
  const label = $('span', btn), old = label.textContent;
  label.textContent = 'Subiendo…'; btn.setAttribute('aria-busy', 'true');
  try {
    const img = await shrinkImage(file);
    await shopApi('/api/orders?op=proof', { c: o.code, t: o.token, img });
    toast('✓ Comprobante enviado. Lo revisaremos pronto.');
    await loadOrder(o.code, o.token, o.fresh);
  } catch (e) { toast(e.message); label.textContent = old; btn.removeAttribute('aria-busy'); }
}
function shrinkImage(file, max = 1400) {
  return new Promise((ok, no) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); no(new Error('No pudimos leer esa imagen. Prueba con otra captura.')); };
    img.src = url;
  });
}

/* ---------- podcast ---------- */
const au = new Audio(); let tickTimer = null;
const epDur = i => D.episodes[i].secs;
function playerSync() {
  const i = ui.playing !== null ? ui.playing : 0, el = ui.elapsed[i] || 0;
  const t = $('#pl-title'); if (!t || !D.episodes[i]) return;
  t.textContent = D.episodes[i].t;
  $('#pl-bar').style.width = (el / epDur(i) * 100) + '%';
  $('#pl-time').textContent = mmss(el) + ' / ' + mmss(epDur(i));
  $('#pl-btn').textContent = ui.playing !== null ? '❚❚' : '▶';
  $('#pl-btn').setAttribute('aria-label', ui.playing !== null ? 'Pausar' : 'Reproducir');
  $$('.ep .play').forEach(b => { const on = +b.dataset.i === ui.playing; b.textContent = on ? '❚❚' : '▶'; b.setAttribute('aria-pressed', on); });
}
function togglePlay(i) {
  const ep = D.episodes[i];
  if (ui.playing === i) { ui.playing = null; au.pause(); clearInterval(tickTimer); playerSync(); return; }
  if (ui.playing !== null) au.pause();
  ui.playing = i; clearInterval(tickTimer);
  if (ep.audio) { if (au.src !== new URL(ep.audio, location.href).href) au.src = ep.audio; au.currentTime = ui.elapsed[i] || 0; au.play().catch(() => toast('No se pudo reproducir el audio')); }
  tickTimer = setInterval(() => {
    if (ep.audio) ui.elapsed[i] = au.currentTime; else ui.elapsed[i] = (ui.elapsed[i] || 0) + 1;
    if (ui.elapsed[i] >= epDur(i)) { ui.elapsed[i] = 0; ui.playing = null; clearInterval(tickTimer); }
    playerSync();
  }, 1000);
  playerSync();
}
function pageEpisodesList() {
  const list = D.episodes.map((e, i) => ({ ...e, i })).filter(e => ui.topic === 'Todos' || e.topic === ui.topic);
  return list.map(e => `<div class="ep"><div class="cv"></div>
    <div><h3>${esc(e.t)}</h3><div class="meta">${esc(e.meta)} · ${esc(e.topic)}</div>${P(e.prod) ? `<a href="#/producto/${e.prod}">Productos mencionados →</a>` : ''}</div>
    <button class="play" data-act="play" data-i="${e.i}" aria-pressed="false" aria-label="Reproducir ${esc(e.t)}">▶</button></div>`).join('') ||
    '<p class="muted" style="padding:24px 0">Aún no hay episodios en este tema.</p>';
}
function pagePodcast() {
  const ext = n => `<button class="btn ghost" data-act="social" data-net="${n}">${n}</button>`;
  return {
    title: 'Podcast', html: `
<div class="pod-page">
  <section class="pod-hero">
    <div class="ph cover"><span aria-hidden="true">[portada]</span></div>
    <div><div class="eyebrow">Podcast</div><h1>Mamá Virtuosa</h1>
      <p>Conversaciones sobre crianza, lactancia, salud y belleza para mamás reales. Un episodio nuevo cada semana.</p>
      <div class="ctas">${D.episodes.length ? '<button class="btn" data-act="play" data-i="0">▶ Último episodio</button>' : ''}${ext('Spotify')}${ext('Apple')}${ext('YouTube')}</div></div>
  </section>
  <div class="topics" role="group" aria-label="Temas">${D.topics.map(t => `<button class="pill ${t === ui.topic ? 'on' : ''}" data-act="topic" data-t="${t}" aria-pressed="${t === ui.topic}">${t}</button>`).join('')}</div>
  <div id="eps">${pageEpisodesList()}</div>
  <div class="player" role="region" aria-label="Reproductor">
    <button class="pp" id="pl-btn" data-act="play-current" aria-label="Reproducir">▶</button>
    <span class="ttl" id="pl-title"></span><div class="bar"><i id="pl-bar"></i></div><span class="tm" id="pl-time"></span>
  </div>
</div>`, after: playerSync
  };
}

function pagePodcastSoon() {
  return { title: 'Podcast · Próximamente', html: `<div class="empty-cart"><div class="eyebrow">Podcast</div><div class="script">Próximamente</div>
    <p class="muted">Estamos preparando los primeros episodios.</p><a class="btn" href="#/">Ir al inicio</a></div>` };
}

/* ---------- ayuda / 404 ---------- */
function pageHelp(k) {
  const h = D.help[k]; if (!h) return pageNotFound();
  return { title: h.title, html: `<div class="help-page">${crumbs([['Inicio', '#/'], [h.title]])}<h1>${esc(h.title)}</h1>${h.body.map(t => `<p>${esc(t)}</p>`).join('')}
    <button class="btn wa" data-act="wa" style="margin-top:12px">💬 Consultar por WhatsApp</button></div>` };
}
function pageNotFound() {
  return { title: 'Página no encontrada', html: `<div class="empty-cart"><div class="script">No encontramos esta página</div><a class="btn" href="#/">Ir al inicio</a></div>` };
}

/* ---------- navegación y megamenú ---------- */
const parseHash = () => (location.hash.slice(1) || '/').split('?')[0].split('/').filter(Boolean).map(s => { try { return decodeURIComponent(s); } catch { return s; } });
function buildNav() {
  $('#nav-row').innerHTML = D.catOrder.map(c => `<a href="${catHref(c)}" data-mega="${esc(c)}" data-nav="${esc(c)}">${esc(c)} <span class="caret" aria-hidden="true">⌄</span></a>`).join('') +
    (SOON ? `<span class="soon" aria-disabled="true">Podcast ${SOON_TAG}</span>` : '<a href="#/podcast" data-nav="podcast">Podcast</a>') + '<a href="#/ofertas" class="offers" data-nav="ofertas">Ofertas</a>';
}
function openMega(k) {
  const m = D.mega[k], box = $('#mega');
  if (!m || !m.cols.length) { closeMega(); return; }
  if (ui.mega === k) return;
  ui.mega = k;
  const p = m.promo && P(m.promo.id);
  box.innerHTML = m.cols.map(c => `<div><h3>${esc(c.t)}</h3><ul>${c.l.map(l => `<li><a href="${catHref(k, c.fid ? 'f~' + c.fid + '~' + l : l)}">${esc(l)}</a></li>`).join('')}</ul></div>`).join('') +
    (!p ? '' : `<a class="promo-card" href="#/producto/${p.id}" style="background:${p.tone}"><div class="ph${pics(p).length ? ' has-img' : ''}" aria-hidden="true">${pics(p).length ? `<img src="${esc(pics(p)[0])}" alt="">` : '[foto destacada]'}</div>
      <div class="txt"><div class="eyebrow">Destacado</div><div class="name">${esc(p.name)}</div><div class="sub">${esc(m.promo.s)}</div></div></a>`);
  box.hidden = false;
  $$('#nav-row a').forEach(a => a.setAttribute('aria-expanded', a.dataset.mega === k ? 'true' : 'false'));
}
function closeMega() { ui.mega = null; $('#mega').hidden = true; $$('#nav-row a[data-mega]').forEach(a => a.removeAttribute('aria-expanded')); }
let lastPointer = 'mouse';
document.addEventListener('pointerdown', e => { lastPointer = e.pointerType; }, true);
const nav = $('#nav');
nav.addEventListener('mouseover', e => { const a = e.target.closest('#nav-row a'); if (a) a.dataset.mega ? openMega(a.dataset.mega) : closeMega(); });
nav.addEventListener('mouseleave', closeMega);
nav.addEventListener('focusin', e => { const a = e.target.closest('#nav-row a'); if (a && a.dataset.mega) openMega(a.dataset.mega); });
nav.addEventListener('focusout', e => { if (!nav.contains(e.relatedTarget)) closeMega(); });
nav.addEventListener('click', e => {
  const a = e.target.closest('#nav-row a[data-mega]');
  if (a && lastPointer === 'touch' && ui.mega !== a.dataset.mega) { e.preventDefault(); openMega(a.dataset.mega); } else if (e.target.closest('a')) closeMega();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMega(); closeDrawer(); } });

function markNav(seg) {
  const cur = seg[0] === 'categoria' ? seg[1] : seg[0] === 'podcast' ? 'podcast' : seg[0] === 'ofertas' ? 'ofertas' : null;
  $$('#nav-row a').forEach(a => { const on = a.dataset.nav === cur; a.classList.toggle('on', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
}

/* ---------- menú móvil ---------- */
function buildDrawer() {
  $('#drawer-body').innerHTML = D.catOrder.map((c, i) => {
    const f1 = filtersOf(c)[0];
    const subs = f1 ? f1.options.filter(o => D.products.some(p => p.cat === c && pvals(p, f1).includes(o))) : [...new Set(D.products.filter(p => p.cat === c).map(p => p.sub).filter(Boolean))];
    return `<div class="d-item"><button data-act="d-acc" aria-expanded="false" aria-controls="ds-${i}"><span>${esc(c)}</span><span aria-hidden="true">⌄</span></button>
      <div class="d-sub" id="ds-${i}" hidden>${subs.map(s => `<a href="${catHref(c, s)}" data-act="drawer-close">${esc(s)}</a>`).join('')}<a href="${catHref(c)}" data-act="drawer-close"><b>Ver todo ${esc(c)}</b></a></div></div>`;
  }).join('') +
    `<div class="d-item">${SOON ? `<span class="soon" aria-disabled="true">🎙 Podcast ${SOON_TAG}</span>` : '<a href="#/podcast" data-act="drawer-close">🎙 Podcast</a>'}</div>
     <div class="d-item"><a href="#/ofertas" data-act="drawer-close" style="color:var(--plum)">Ofertas</a></div>
     <div class="d-foot"><a href="#/pedidos" data-act="drawer-close">Mis pedidos</a><a href="#/ayuda/envios" data-act="drawer-close">Ayuda</a><a href="#" data-act="wa">WhatsApp</a></div>`;
}
let drawerOpener = null;
function openDrawer() {
  drawerOpener = document.activeElement;
  $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false');
  $('#scrim').hidden = false; $('#page').inert = true; $('.wa-float').inert = true;
  $('.menu-btn').setAttribute('aria-expanded', 'true');
  $('.drawer-head .icon-btn').focus();
}
function closeDrawer() {
  const d = $('#drawer'); if (!d.classList.contains('open')) return;
  d.classList.remove('open'); d.setAttribute('aria-hidden', 'true');
  $('#scrim').hidden = true; $('#page').inert = false; $('.wa-float').inert = false;
  $('.menu-btn').setAttribute('aria-expanded', 'false');
  if (drawerOpener && drawerOpener.focus) drawerOpener.focus();
}

/* ---------- router ---------- */
let firstRender = true;
function render(keepScroll) {
  const seg = parseHash();
  let r;
  switch (seg[0]) {
    case undefined: r = pageHome(); break;
    case 'categoria': r = pageCategory(seg[1], seg[2]); break;
    case 'ofertas': r = pageOffers(); break;
    case 'mas-vendidos': r = pageBest(); break;
    case 'buscar': r = pageSearch(seg[1] || ''); break;
    case 'producto': r = pageProduct(seg[1]); break;
    case 'carrito': r = pageCart(); break;
    case 'checkout': r = pageCheckout(); break;
    case 'pedido': r = pageOrder(seg[1], seg[2]); break;
    case 'pedidos': r = pageMyOrders(); break;
    case 'podcast': r = SOON ? pagePodcastSoon() : pagePodcast(); break;
    case 'ayuda': r = pageHelp(seg[1]); break;
    default: r = pageNotFound();
  }
  if (!r) return;
  const y = scrollY;
  main.innerHTML = r.html;
  document.title = r.title.includes('Mamá Virtuosa') ? r.title : r.title + ' · Mamá Virtuosa';
  if (r.after) r.after();
  markNav(seg); closeMega(); closeDrawer();
  $('#search-form').classList.remove('open'); $('[data-act=search-toggle]').setAttribute('aria-expanded', 'false');
  $('#search-input').value = seg[0] === 'buscar' ? (seg[1] || '') : $('#search-input').value;
  if (!keepScroll) { scrollTo(0, 0); if (!firstRender) main.focus({ preventScroll: true }); } else scrollTo(0, y);
  firstRender = false;
}
window.addEventListener('hashchange', () => {
  if (parseHash()[0] === 'checkout') { ui.couponMsg = null; }
  render();
});

/* ---------- acciones (clics) ---------- */
function rerenderKeepFocus() {
  const a = document.activeElement, sel = a && a.dataset && a.dataset.act
    ? `[data-act="${a.dataset.act}"]` + (a.dataset.i ? `[data-i="${a.dataset.i}"]` : '') + (a.dataset.d ? `[data-d="${a.dataset.d}"]` : '') + (a.dataset.k ? `[data-k="${a.dataset.k}"]` : '') : null;
  render(true);
  if (sel) { const n = $(sel); if (n && !n.disabled) n.focus({ preventScroll: true }); }
}
const actions = {
  'drawer-open': openDrawer,
  'drawer-close': closeDrawer,
  'd-acc'(el) { const open = el.getAttribute('aria-expanded') === 'true'; el.setAttribute('aria-expanded', !open); $('#' + el.getAttribute('aria-controls')).hidden = open; },
  'search-toggle'(el) { const f = $('#search-form'); const o = f.classList.toggle('open'); el.setAttribute('aria-expanded', o); if (o) $('#search-input').focus(); },
  'filters-toggle'(el) { const o = $('#filters').classList.toggle('open'); el.setAttribute('aria-expanded', o); },
  toast(el) { toast(el.dataset.msg); },
  wa(el) { window.open(waLink(el.dataset.msg), '_blank', 'noopener'); },
  social(el) {
    const url = C.social[el.dataset.net];
    if (url) window.open(url, '_blank', 'noopener'); else toast('Enlace de ' + el.dataset.net + ' próximamente');
  },
  'pdp-qty'(el) { const p = P(currentProductId()); ui.pdp.qty = Math.max(1, Math.min(MAX_QTY, ui.pdp.qty + (+el.dataset.d))); syncPDP(); },
  'pdp-opt'(el) { ui.pdp.opt = el.dataset.v; syncPDP(); },
  'pdp-img'(el) { ui.pdp.img = +el.dataset.i; syncPDP(); },
  'quick-add'(el) {
    const p = P(+el.dataset.id); if (!p) return;
    const capped = addToCart(p.id, null, 1);
    nudgeCart();
    toast(capped ? 'Ya tienes el máximo disponible de este producto' : '✓ Agregado al carrito', { href: '#/carrito', label: 'Ver carrito' });
  },
  'pdp-add'() {
    const capped = addToCart(currentProductId(), ui.pdp.opt, ui.pdp.qty);
    nudgeCart();
    toast(capped ? 'Agregado. Es el máximo disponible de este producto' : '✓ Agregado al carrito', { href: '#/carrito', label: 'Ver carrito' });
  },
  'pdp-buy'() { addToCart(currentProductId(), ui.pdp.opt, ui.pdp.qty); location.hash = '#/checkout'; },
  'line-qty'(el) { const l = cart[+el.dataset.i], p = P(l.id); l.qty = Math.max(1, Math.min(maxQty(p), l.qty + (+el.dataset.d))); saveCart(); rerenderKeepFocus(); },
  'line-rm'(el) { cart.splice(+el.dataset.i, 1); saveCart(); render(true); },
  'pick-ship'(el) {
    ui.co.ship = el.dataset.k;
    ui.co.err = {}; rerenderKeepFocus();
  },
  'pick-pay'(el) { if (ui.co.pay !== el.dataset.k) { ui.co.pay = el.dataset.k; rerenderKeepFocus(); } },
  copy(el) { (navigator.clipboard ? navigator.clipboard.writeText(el.dataset.v) : Promise.reject()).then(() => toast('Copiado: ' + el.dataset.v), () => toast('No se pudo copiar. Selecciónalo y cópialo a mano')); },
  'order-refresh'() { if (ordCtx) { toast('Estado actualizado'); loadOrder(ordCtx.code, ordCtx.token, ordCtx.fresh); } },
  play(el) { togglePlay(+el.dataset.i); },
  'play-current'() { togglePlay(ui.playing !== null ? ui.playing : 0); },
  topic(el) { ui.topic = el.dataset.t; $('#eps').innerHTML = pageEpisodesList(); $$('.topics .pill').forEach(b => { const on = b.dataset.t === ui.topic; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); playerSync(); }
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  if (el.tagName === 'A' && el.getAttribute('href') === '#') e.preventDefault();
  if (el.dataset.act === 'wa' || el.dataset.act === 'social') e.preventDefault();
  fn(el);
});

/* ---------- formularios y filtros ---------- */
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.co) {
    ui.co.f[t.dataset.co] = t.value;
    if (!['notes', 'dni'].includes(t.dataset.co)) store.set('mv_fields', Object.fromEntries(Object.entries(ui.co.f).filter(([k]) => !['notes', 'dni'].includes(k))));
    if (t.closest('[data-fld]').classList.contains('err') && !fieldError(t.dataset.co)) showErr(t.dataset.co, '');
  }
  if (t.dataset.f === 'min') { F.min = +t.value; if (F.min > F.max) { F.max = F.min; $('[data-f=max]').value = F.max; } updateGrid(); }
  if (t.dataset.f === 'max') { F.max = +t.value; if (F.max < F.min) { F.min = F.max; $('[data-f=min]').value = F.min; } updateGrid(); }
});
document.addEventListener('change', e => {
  const t = e.target, f = t.dataset.f;
  if (t.dataset.co === 'distrito' && ui.co.ship === 'lima') { ui.co.f.distrito = t.value; store.set('mv_fields', Object.fromEntries(Object.entries(ui.co.f).filter(([k]) => !['notes', 'dni'].includes(k)))); delete ui.co.err.distrito; render(true); const n = $('#f-distrito'); if (n) n.focus(); return; }
  if (t.dataset.coCheck) {
    ui.co[t.dataset.coCheck] = t.checked;
    if (t.dataset.coCheck === 'doc') { ui.co.err = {}; render(true); const n = $('#f-dni'); if (t.checked && n) n.focus(); else $('[data-co-check=doc]').focus(); }
    if (t.dataset.coCheck === 'agree' && t.checked) { const m = $('#e-agree'); if (m) { m.textContent = ''; m.parentElement.classList.remove('err'); } }
    return;
  }
  if (t.dataset.coRadio) { ui.co[t.dataset.coRadio] = t.value; ui.co.err = {}; render(true); const r = $(`[data-co-radio][value="${t.value}"]`); if (r) r.focus(); return; }
  if (t.dataset.proof !== undefined) { sendProof(t.files[0]); t.value = ''; return; }
  if (!f || !F) return;
  if (f === 'sub') { t.checked ? F.subs.add(t.value) : F.subs.delete(t.value); }
  if (f === 'fopt') { t.checked ? F.sel[t.dataset.fid].add(t.value) : F.sel[t.dataset.fid].delete(t.value); }
  if (f === 'fall') { F.sel[t.dataset.fid].clear(); }
  if (f === 'subs-all') { F.subs.clear(); }
  if (f === 'age') { t.checked ? F.ages.add(t.value) : F.ages.delete(t.value); }
  if (f === 'offers') F.offers = t.checked;
  if (f === 'sort') F.sort = t.value;
  updateGrid();
});
document.addEventListener('focusout', e => {
  const t = e.target;
  if (!t.dataset || !t.dataset.co || !applies(t.dataset.co)) return;
  showErr(t.dataset.co, fieldError(t.dataset.co));
});
document.addEventListener('submit', e => {
  const form = e.target, kind = form.dataset.form;
  if (form.id === 'search-form') {
    e.preventDefault();
    const q = $('#search-input').value.trim();
    if (q) location.hash = '#/buscar/' + encodeURIComponent(q);
    return;
  }
  if (form.id === 'news-form') { e.preventDefault(); form.reset(); toast('¡Gracias por suscribirte!'); return; }
  if (!kind) return;
  e.preventDefault();
  if (kind === 'coupon') {
    const btn = $('button', form); btn.disabled = true; btn.textContent = '…';
    applyCoupon(new FormData(form).get('code')).then(() => rerenderKeepFocus());
    return;
  }
  if (kind === 'order') submitOrder(form);
});

/* ---------- arranque ---------- */
$('#year').textContent = new Date().getFullYear();
buildNav(); buildDrawer();
if (SOON) { const f = $('.foot-podcast'); if (f) f.outerHTML = `<span class="soon" aria-disabled="true">Podcast ${SOON_TAG}</span>`; } updateCartCount(); render();
})();
