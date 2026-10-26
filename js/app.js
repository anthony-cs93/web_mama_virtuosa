(() => {
'use strict';
const C = window.MV_CONFIG, D = window.MV_DATA;

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
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
function waLink(msg) {
  return 'https://wa.me/' + C.whatsapp + '?text=' + encodeURIComponent(msg || C.whatsappMsg);
}

/* ---------- carrito ---------- */
let cart = store.get('mv_cart', []).filter(l => l && P(l.id) && l.qty > 0);
let coupon = store.get('mv_coupon', '');
if (coupon && !C.coupons[coupon]) coupon = '';
const saveCart = () => { store.set('mv_cart', cart); store.set('mv_coupon', coupon); updateCartCount(); };
function updateCartCount() { $('#cart-count').textContent = cart.reduce((a, l) => a + l.qty, 0); }
function addToCart(id, opt, qty) {
  const p = P(id), ex = cart.find(l => l.id === id && (l.opt || null) === (opt || null));
  if (ex) ex.qty = Math.min(p.stock, ex.qty + qty); else cart.push({ id, opt: opt || null, qty: Math.min(p.stock, qty) });
  saveCart();
}
function shipCost(sub, ship) {
  if (ship === 'lima') return sub >= C.freeShippingFrom ? 0 : D.shipping.lima.p;
  return D.shipping[ship].p;
}
function totals(ship) {
  const sub = cart.reduce((a, l) => a + P(l.id).price * l.qty, 0);
  const count = cart.reduce((a, l) => a + l.qty, 0);
  const disc = Math.round(sub * (C.coupons[coupon] || 0) * 100) / 100;
  const sh = ship ? shipCost(sub, ship) : 0;
  return { sub, count, disc, sh, total: sub - disc + sh };
}

/* ---------- estado de interfaz ---------- */
const ui = {
  pdp: { qty: 1, opt: null, img: 0 },
  co: { step: 1, ship: 'lima', pay: 'card', f: {}, err: {}, agree: false, ruc: false, order: null },
  couponMsg: null,
  playing: null, elapsed: {}, topic: 'Todos', mega: null
};

/* ---------- piezas de HTML ---------- */
const imgOrLabel = (p, label) => p.img
  ? `<img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy">`
  : `<span aria-hidden="true">${label}</span>`;

const card = (p, withCat) => `<a class="card" href="#/producto/${p.id}">
  <div class="ph" style="background:${p.tone}">${imgOrLabel(p, '[foto producto]')}<span class="tag">${esc(p.tag)}</span></div>
  <div class="nm">${esc(p.name)}</div>${withCat ? `<div class="ct">${esc(p.cat)}</div>` : ''}
  <div class="pr"><b>${fmt(p.price)}</b>${p.old ? ` <s>${fmt(p.old)}</s>` : ''}</div></a>`;

const crumbs = list => `<nav class="crumbs" aria-label="Ruta">${list.map(([l, h]) => h ? `<a href="${h}">${esc(l)}</a>` : `<span aria-current="page">${esc(l)}</span>`).join(' › ')}</nav>`;

/* Iconos de categoría (trazo, 48×48) */
const CAT_ICONS = {
  'Belleza': '<rect x="15" y="28" width="18" height="15" rx="2.5"/><rect x="17.5" y="21" width="13" height="7" rx="1.5"/><path d="M19 21v-9l10-5v14"/><path d="M36 8v7M32.5 11.5h7M10 14v4M8 16h4"/>',
  'Bebé y niños': '<path d="M20 12c0-4 2-7 4-7s4 3 4 7"/><rect x="17" y="12" width="14" height="4" rx="1.5"/><rect x="15" y="16" width="18" height="27" rx="5"/><path d="M24 25h5M24 31h5M24 37h5"/>',
  'Ropa infantil': '<path d="M19 5c0 4 1.5 7 5 7s5-3 5-7"/><path d="M19 12l-3 11-8 18h32l-8-18-3-11"/><path d="M16 23h16"/>',
  'Gomitas saludables': '<circle cx="16" cy="9" r="3.5"/><circle cx="32" cy="9" r="3.5"/><circle cx="24" cy="15" r="8"/><path d="M16 25c-3 2-4 8-3 14 1 3 4 5 7 5h8c3 0 6-2 7-5 1-6 0-12-3-14"/><path d="M21 14v.5M27 14v.5M22 18c1 1 3 1 4 0" /><path d="M10 28l3 3M38 28l-3 3"/>'
};
const catIcon = c => `<svg class="cat-ico" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${CAT_ICONS[c] || ''}</svg>`;

/* ---------- inicio ---------- */
function pageHome() {
  const best = [1, 5, 4, 7].map(P);
  return {
    title: 'Mamá Virtuosa by Angie · Belleza, niños, ropa y gomitas',
    html: `
<section class="hero" aria-labelledby="hero-h">
  <div class="hero-txt">
    <div class="eyebrow">Nueva colección</div>
    <h1 id="hero-h">Todo para mamá y sus peques</h1>
    <p>Belleza, básicos para niños, ropa, gomitas saludables y un podcast para acompañarte en la crianza.</p>
    <div class="ctas"><a class="btn" href="${catHref('Belleza')}">Comprar ahora</a><a class="btn ghost" href="#/podcast">▶ Escuchar podcast</a></div>
  </div>
  <div class="hero-img"><img src="img/hero.jpg" srcset="img/hero-m.jpg 800w, img/hero.jpg 1600w" sizes="(max-width:900px) 100vw, 50vw" width="1600" height="900" alt="Una mamá sonríe a su hija mientras le acomoda el cabello en un cuarto luminoso" fetchpriority="high"></div>
</section>
<div class="trust"><div>🚚 Envíos a todo el Perú</div><div>🔒 Pago seguro · Yape · Plin · Tarjetas</div><div>↺ Cambios hasta 7 días</div></div>
<section class="section" aria-labelledby="h-cat">
  <h2 class="sec-title" id="h-cat">Compra por categoría</h2>
  <div class="cat-grid">${D.catOrder.map(c => `<a class="cat-card" href="${catHref(c)}">
    <div class="ph" style="background:${D.catTone[c]}">${catIcon(c)}</div>
    <div class="nm">${esc(c)}</div><div class="sb">${esc(D.catSub[c])}</div></a>`).join('')}</div>
</section>
<section class="section s48" aria-labelledby="h-best">
  <div class="sec-head"><h2 class="sec-title" id="h-best">Más vendidos</h2><a class="link" href="${catHref('Belleza')}">Ver todo →</a></div>
  <div class="prod-grid">${best.map(p => card(p, true)).join('')}</div>
</section>
<section class="podcast-band" aria-labelledby="h-pod">
  <div class="ph cover"><span aria-hidden="true">[portada podcast]</span></div>
  <div>
    <div class="eyebrow">Podcast Mamá Virtuosa</div>
    <h2 id="h-pod">Últimos episodios</h2>
    <div class="ep-mini">${D.episodes.slice(0, 3).map(e => `<a href="#/podcast"><span class="dot-play" aria-hidden="true">▶</span><span><b>${esc(e.t)}</b><small>${esc(e.meta)}</small></span></a>`).join('')}</div>
    <a class="band-link" href="#/podcast">Ver todos los episodios →</a>
  </div>
</section>
<div class="home-end"></div>`
  };
}

/* ---------- listados (categoría, ofertas, búsqueda) ---------- */
let F = null;
function initFilters(base, presetSub) {
  const prices = base.map(p => p.price);
  const lo = prices.length ? Math.floor(Math.min(...prices) / 10) * 10 : 0;
  const hi = prices.length ? Math.ceil(Math.max(...prices) / 10) * 10 : 100;
  F = { base, lo, hi, min: lo, max: hi, subs: new Set(presetSub ? [presetSub] : []), ages: new Set(), offers: false, sort: 'sales' };
}
function filtered() {
  const list = F.base.filter(p =>
    (!F.subs.size || F.subs.has(p.sub)) && p.price >= F.min && p.price <= F.max &&
    (!F.ages.size || p.ages.some(a => F.ages.has(a))) && (!F.offers || p.old) && p.stock > 0);
  const by = {
    sales: (a, b) => (a.tag === 'Top' ? 0 : 1) - (b.tag === 'Top' ? 0 : 1),
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
  const all = $('[data-f=subs-all]'); if (all) all.checked = F.subs.size === 0;
  $('#min-out') && ($('#min-out').textContent = 'S/ ' + F.min);
  $('#max-out') && ($('#max-out').textContent = 'S/ ' + F.max);
}
function listPage({ title, crumbList, base, sub, pending, showSubs = true }) {
  initFilters(base, sub);
  const subs = [...new Set(base.map(p => p.sub))];
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
      ${showSubs ? `<fieldset><legend>Subcategoría</legend>
        <label class="chk"><input type="checkbox" data-f="subs-all" checked> Todas</label>
        ${subs.map(s => `<label class="chk"><input type="checkbox" data-f="sub" value="${esc(s)}"> ${esc(s)}</label>`).join('')}</fieldset>` : ''}
      <fieldset><legend>Precio</legend>
        <div class="range">
          <input type="range" data-f="min" min="${F.lo}" max="${F.hi}" step="5" value="${F.min}" aria-label="Precio mínimo">
          <input type="range" data-f="max" min="${F.lo}" max="${F.hi}" step="5" value="${F.max}" aria-label="Precio máximo">
          <div class="vals"><span id="min-out"></span><span id="max-out"></span></div>
        </div></fieldset>
      <fieldset><legend>Edad del niño</legend>
        <div class="age-chips">${['0–1', '1–3', '3–6'].map(a => `<label><input type="checkbox" data-f="age" value="${a}"><span>${a}</span></label>`).join('')}</div></fieldset>
      <div><label class="chk"><input type="checkbox" data-f="offers"> Solo ofertas</label>
        <label class="chk"><input type="checkbox" checked disabled> Disponible</label></div>
    </form>
    <div class="prod-grid three" id="grid"></div>
  </div>
</div>`;
  return { title, html, after: () => updateGrid(pending) };
}
function pageCategory(cat, sub) {
  if (!D.catOrder.includes(cat)) return pageNotFound();
  const base = D.products.filter(p => p.cat === cat);
  const has = sub && base.some(p => p.sub === sub);
  return listPage({
    title: sub || cat,
    crumbList: [['Inicio', '#/'], [cat, sub ? catHref(cat) : null], ...(sub ? [[sub]] : [])],
    base, sub: has ? sub : null, pending: sub && !has ? sub : null
  });
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
  const related = [1, 5, 4, 7, 6, 3].filter(i => i !== p.id).slice(0, 4).map(P);
  const stockTxt = p.stock <= 10 ? `Stock disponible: ${p.stock} unidades` : 'Stock disponible';
  const qtyCtl = cls => `<div class="qty ${cls || ''}"><button type="button" data-act="pdp-qty" data-d="-1" aria-label="Menos">–</button><output data-qty-out aria-live="polite">1</output><button type="button" data-act="pdp-qty" data-d="1" aria-label="Más">+</button></div>`;
  const html = `
<div class="pdp">
  ${crumbs([['Inicio', '#/'], [p.cat, catHref(p.cat)], [p.name]])}
  <div class="pdp-grid">
    <div class="thumbs">
      ${[0, 1, 2].map(i => `<button class="thumb ph" data-act="pdp-img" data-i="${i}" style="background:${p.tone}" aria-label="Ver foto ${i + 1}"></button>`).join('')}
      <button class="thumb video" data-act="toast" data-msg="El video estará disponible pronto">▶ video</button>
    </div>
    <div>
      <div class="main-img ph" id="main-img" style="background:${p.tone}">${p.img ? `<img src="${esc(p.img)}" alt="${esc(p.name)}">` : '<span id="main-lbl">[foto principal]</span>'}</div>
      <div class="dots" aria-label="Fotos">${[0, 1, 2].map(i => `<button data-act="pdp-img" data-i="${i}" aria-label="Foto ${i + 1}"></button>`).join('')}</div>
    </div>
    <div class="info">
      <div class="eyebrow">${esc(p.cat)}</div>
      <h1>${esc(p.name)}</h1>
      <div class="price">${fmt(p.price)}${p.old ? `<s>${fmt(p.old)}</s>` : ''}</div>
      <div class="muted" style="font-size:14px">Paga con tarjeta, Yape o Plin.</div>
      ${p.opt ? `<div><div class="opt-head"><span>${esc(p.opt.label)}</span>${p.opt.label === 'Talla' ? '<button class="link ul" data-act="toast" data-msg="La guía de tallas estará disponible pronto">Guía de tallas</button>' : ''}</div>
        <div class="opts" role="group" aria-label="${esc(p.opt.label)}">${p.opt.values.map(v => `<button class="opt" data-act="pdp-opt" data-v="${esc(v)}" aria-pressed="false">${esc(v)}</button>`).join('')}</div></div>` : ''}
      <div class="buy-row desk">${qtyCtl()}<button class="btn" data-act="pdp-add">Agregar al carrito</button></div>
      <button class="btn ghost" data-act="pdp-buy">Comprar ahora</button>
      <button class="btn wa" data-act="wa" data-msg="${esc('Hola Angie, me interesa: ' + p.name)}">💬 Consultar por WhatsApp</button>
      <div class="perks">🚚 Lima 2–4 días · provincias 4–7 días<br>↺ Cambios hasta 7 días<br>✔ ${stockTxt}</div>
      <div class="acc">
        <details open><summary>Descripción</summary><p>${esc(p.desc)}</p></details>
        <details><summary>Medidas y cuidados</summary><p>${esc(p.care)}</p></details>
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
}
function currentProductId() { return +parseHash()[1]; }

/* ---------- carrito (página) ---------- */
function lineLabel(l) { const p = P(l.id); return l.opt ? `${p.opt ? p.opt.label + ' ' : ''}${l.opt}` : p.cat; }
function cartView() {
  const t = totals();
  const need = Math.max(0, C.freeShippingFrom - t.sub);
  const pct = Math.min(100, t.sub / C.freeShippingFrom * 100).toFixed(0);
  let body;
  if (!cart.length) {
    body = `<div class="empty-cart"><div class="script">Tu carrito está vacío</div><a class="btn" href="#/">Seguir comprando</a></div>`;
  } else {
    body = `<div class="cart-grid">
  <div>
    <div class="free-bar" role="status">${need > 0 ? `Te faltan <b>${fmt(need)}</b> para envío gratis en Lima` : '¡Tienes envío gratis en Lima!'}<div class="track"><div class="fill" style="width:${pct}%"></div></div></div>
    <div class="lines">${cart.map((l, i) => { const p = P(l.id); return `<div class="line">
      <div class="ph" style="background:${p.tone}">${p.img ? `<img src="${esc(p.img)}" alt="">` : ''}</div>
      <div><a class="nm" href="#/producto/${p.id}" style="color:inherit">${esc(p.name)}</a><div class="un">${esc(lineLabel(l))} · ${fmt(p.price)} c/u</div>
        <button class="link ul" data-act="line-rm" data-i="${i}">Quitar</button></div>
      <div class="qty sm"><button data-act="line-qty" data-i="${i}" data-d="-1" aria-label="Menos">–</button><b>${l.qty}</b><button data-act="line-qty" data-i="${i}" data-d="1" aria-label="Más">+</button></div>
      <div class="tot">${fmt(p.price * l.qty)}</div></div>`; }).join('')}</div>
    <a class="link" href="#/" style="display:inline-block;margin-top:18px">← Seguir comprando</a>
  </div>
  <aside class="summary" aria-label="Resumen">
    <h2>Resumen</h2>
    <form class="coupon" data-form="coupon"><input name="code" placeholder="Cupón de descuento" aria-label="Cupón de descuento" autocomplete="off" value="${esc(coupon)}"><button type="submit">Aplicar</button></form>
    ${ui.couponMsg ? `<div class="coupon-msg ${ui.couponMsg.ok ? 'ok' : 'bad'}" role="status">${esc(ui.couponMsg.t)}</div>` : ''}
    <div class="srow"><span>Subtotal</span><span>${fmt(t.sub)}</span></div>
    ${t.disc ? `<div class="srow disc"><span>Cupón ${esc(coupon)}</span><span>− ${fmt(t.disc)}</span></div>` : ''}
    <div class="srow"><span>Envío</span><span class="muted">se calcula al pagar</span></div>
    <div class="srow total"><span>Total</span><span>${fmt(t.total)}</span></div>
    <a class="btn block" href="#/checkout" data-act="to-checkout">Ir a pagar</a>
    <div class="safe">🔒 Pago seguro · Visa · Mastercard · Yape · Plin</div>
  </aside>
</div>`;
  }
  return `<div class="cart-page"><h1>Tu carrito <span>${t.count} ${t.count === 1 ? 'producto' : 'productos'}</span></h1>${body}</div>`;
}
function pageCart() { return { title: 'Tu carrito', html: cartView() }; }

/* ---------- checkout ---------- */
const FIELDS = {
  email: { l: 'Correo electrónico', type: 'email', ac: 'email', test: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), msg: 'Ingresa un correo válido' },
  phone: { l: 'Celular', type: 'tel', ac: 'tel-national', test: v => /^\d{9}$/.test(v.replace(/\s/g, '')), msg: 'Ingresa un celular de 9 dígitos' },
  nombres: { l: 'Nombres', ac: 'given-name' },
  apellidos: { l: 'Apellidos', ac: 'family-name' },
  dni: { l: 'DNI / CE', ac: 'off', test: v => /^[A-Za-z0-9]{8,12}$/.test(v), msg: 'Ingresa un DNI (8 dígitos) o CE válido', addr: false },
  depto: { l: 'Departamento', ac: 'address-level1', addr: true },
  prov: { l: 'Provincia', ac: 'address-level2', addr: true },
  distrito: { l: 'Distrito', ac: 'address-level3', addr: true },
  dir: { l: 'Dirección y número', ac: 'street-address', addr: true },
  ref: { l: 'Referencia (opcional)', opt: true },
  ruc: { l: 'RUC', ac: 'off', test: v => /^\d{11}$/.test(v), msg: 'El RUC tiene 11 dígitos', billing: true },
  razon: { l: 'Razón social', ac: 'organization', billing: true }
};
const fld = (k, extra = '') => {
  const d = FIELDS[k], v = ui.co.f[k] || '', e = ui.co.err[k];
  return `<div class="fld ${e ? 'err' : ''} ${extra}"><label for="f-${k}">${d.l}</label>
    <input id="f-${k}" name="${k}" data-co="${k}" type="${d.type || 'text'}" value="${esc(v)}" autocomplete="${d.ac || 'off'}"${d.type === 'tel' ? ' inputmode="numeric"' : ''}${e ? ` aria-invalid="true" aria-describedby="e-${k}"` : ''}>
    <div class="msg" id="e-${k}">${e ? esc(e) : ''}</div></div>`;
};
function validateStep1() {
  const st = ui.co, err = {};
  Object.entries(FIELDS).forEach(([k, d]) => {
    if (d.opt) return;
    if (d.billing && !st.ruc) return;
    if (d.addr && st.ship === 'pick') return;
    const v = (st.f[k] || '').trim();
    if (!v) err[k] = 'Completa este campo';
    else if (d.test && !d.test(v)) err[k] = d.msg;
  });
  st.err = err;
  return Object.keys(err);
}
function choiceHTML(kind, map, selected, disabledKeys = []) {
  return `<div role="radiogroup" style="display:flex;flex-direction:column;gap:14px">${Object.keys(map).map(k => {
    const o = map[k], dis = disabledKeys.includes(k);
    const price = kind === 'ship' ? `<b>${shipCost(totals().sub, k) === 0 ? 'Gratis' : fmt(shipCost(totals().sub, k))}</b>` : '';
    return `<button type="button" class="choice" role="radio" aria-checked="${selected === k}" data-act="pick-${kind}" data-k="${k}"${dis ? ' disabled' : ''}>
      <span class="rd"></span><span class="tx"><b>${esc(o.l)}</b><small>${esc(o.s)}${dis ? ' · no disponible para provincia' : ''}</small></span>${price}</button>`;
  }).join('')}</div>`;
}
function summaryHTML(inner) {
  const st = ui.co, t = totals(st.ship);
  const rows = cart.map(l => { const p = P(l.id); return `<div class="sum-line"><div class="ph" style="background:${p.tone}">${p.img ? `<img src="${esc(p.img)}" alt="">` : ''}</div>
    <div class="t"><b>${esc(p.name)}</b><br><span class="muted">${l.opt ? esc(l.opt) + ' · ' : ''}Cant. ${l.qty}</span></div><b>${fmt(p.price * l.qty)}</b></div>`; }).join('');
  return `${inner ? '' : '<h2>Resumen del pedido</h2>'}${rows}
    <div class="srow" style="border-top:1px solid var(--line);padding-top:12px"><span>Subtotal</span><span>${fmt(t.sub)}</span></div>
    ${t.disc ? `<div class="srow disc"><span>Cupón ${esc(coupon)}</span><span>− ${fmt(t.disc)}</span></div>` : ''}
    <div class="srow"><span>Envío</span><span>${t.sh === 0 ? 'Gratis' : fmt(t.sh)}</span></div>
    <div class="srow total"><span>Total</span><span>${fmt(t.total)}</span></div>
    <div class="safe">🔒 Pago seguro</div>`;
}
function checkoutView() {
  const st = ui.co, t = totals(st.ship);
  const steps = ['Datos', 'Pago', 'Listo'].map((l, i) => `<div class="step ${st.step === i + 1 ? 'cur' : st.step > i + 1 ? 'done' : ''}"><i>${i + 1}</i><span>${l}</span>${i < 2 ? '<em>—</em>' : ''}</div>`).join('');
  let left;
  if (st.step === 1) {
    left = `<form class="form" data-form="step1" novalidate>
      <div class="head-row"><h2>Contacto</h2></div>
      ${fld('email')}${fld('phone')}
      <h2>Datos y dirección de envío</h2>
      <div class="row2">${fld('nombres')}${fld('apellidos')}${fld('dni', 'span2')}</div>
      ${st.ship === 'pick' ? '<div class="pay-note">Con recojo en punto no necesitas ingresar dirección. Te avisaremos por WhatsApp dónde recoger.</div>' :
        `<div class="row2">${fld('depto')}${fld('prov')}${fld('distrito', 'span2')}</div>${fld('dir')}${fld('ref')}`}
      <h2>Método de entrega</h2>
      ${choiceHTML('ship', D.shipping, st.ship)}
      <div class="actions"><a class="link" href="#/carrito">← Volver al carrito</a><button class="btn" type="submit">Continuar al pago</button></div></form>`;
  } else if (st.step === 2) {
    const f = st.f, addr = st.ship === 'pick' ? 'Recojo en punto' : `${esc(f.dir)}, ${esc(f.distrito)}`;
    left = `<form class="form" data-form="step2" novalidate>
      <div class="recap"><button type="button" class="link ul" data-act="goto-step1">Cambiar</button>Contacto: ${esc(f.email)}<br><span class="muted">Enviar a:</span> ${addr}</div>
      <h2>Método de pago</h2>
      ${choiceHTML('pay', D.payments, st.pay, st.ship === 'prov' ? ['cod'] : [])}
      ${st.pay === 'card' ? `<div class="row2">
        <div class="fld span2"><label for="cc-num">Número de tarjeta</label><input id="cc-num" inputmode="numeric" autocomplete="cc-number" maxlength="23"></div>
        <div class="fld"><label for="cc-exp">MM/AA</label><input id="cc-exp" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/AA" maxlength="5"></div>
        <div class="fld"><label for="cc-cvv">CVV</label><input id="cc-cvv" inputmode="numeric" autocomplete="cc-csc" maxlength="4"></div>
        <div class="fld span2"><label for="cc-name">Nombre en la tarjeta</label><input id="cc-name" autocomplete="cc-name"></div></div>` : ''}
      ${st.pay === 'yape' ? '<div class="pay-note">Al confirmar te enviaremos el QR de Yape / Plin para completar el pago.</div>' : ''}
      ${st.pay === 'bank' ? '<div class="pay-note">Al confirmar te enviaremos los datos de la cuenta. Envía el voucher por WhatsApp para validar tu pago.</div>' : ''}
      ${st.pay === 'cod' ? '<div class="pay-note">Pagas al recibir tu pedido. Solo disponible en Lima.</div>' : ''}
      <div class="legal">
        <label><input type="checkbox" data-co-check="ruc"${st.ruc ? ' checked' : ''}> Factura con RUC</label>
        ${st.ruc ? `<div class="row2" style="margin:6px 0">${fld('ruc')}${fld('razon')}</div>` : ''}
        <label><input type="checkbox" data-co-check="agree" id="agree"${st.agree ? ' checked' : ''}> Acepto los términos y la política de privacidad</label>
        <div class="fld ${st.err.agree ? 'err' : ''}"><div class="msg" id="e-agree" role="alert">${st.err.agree ? esc(st.err.agree) : ''}</div></div>
      </div>
      <div class="actions"><button type="button" class="link" data-act="goto-step1">← Volver</button><button class="btn" type="submit">Confirmar pedido · ${fmt(t.total)}</button></div></form>`;
  } else {
    const o = st.order;
    left = `<div class="done">
      <div class="check" aria-hidden="true">✓</div>
      <h1 class="script">¡Gracias por tu compra!</h1>
      <div class="muted" style="font-size:16px">Pedido <b style="color:var(--ink)">#${esc(o.no)}</b> · enviaremos el detalle a ${esc(o.email)}</div>
      <div class="card-info">Entrega estimada: <b>${esc(o.eta)}</b><br>Envío: <b>${esc(o.ship)}</b><br>Pago: <b>${esc(o.pay)}</b><br>Total: <b>${fmt(o.total)}</b></div>
      <div class="row"><a class="btn" href="#/">Seguir comprando</a><button class="btn wa" data-act="wa" data-msg="${esc('Hola Angie, acabo de hacer el pedido #' + o.no + '.')}">💬 Escribir por WhatsApp</button></div>
      <a class="podcast-link" href="#/podcast">🎙 Mientras esperas, escucha el último episodio ▶</a></div>`;
  }
  const side = st.step < 3 ? `<aside class="summary co-side" aria-label="Resumen del pedido">${summaryHTML()}</aside>` : '';
  const mSum = st.step < 3 ? `<details class="sum-m"><summary><span>Resumen del pedido (${t.count})</span><b>${fmt(t.total)} ⌄</b></summary><div class="in">${summaryHTML(true)}</div></details>` : '';
  return `<div class="co-page">${st.step < 3 ? '<h1 class="sr">Finalizar compra</h1>' : ''}
    <div class="steps" aria-label="Progreso">${steps}</div>${mSum}<div class="co-grid"><div>${left}</div>${side}</div></div>`;
}
function pageCheckout() {
  if (cart.length && ui.co.step === 3) ui.co.step = 1;
  if (!cart.length && ui.co.step !== 3) { location.replace('#/carrito'); return null; }
  return { title: 'Checkout', html: checkoutView() };
}

/* ---------- podcast ---------- */
const au = new Audio(); let tickTimer = null;
const epDur = i => D.episodes[i].secs;
function playerSync() {
  const i = ui.playing !== null ? ui.playing : 0, el = ui.elapsed[i] || 0;
  const t = $('#pl-title'); if (!t) return;
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
    <div><h3>${esc(e.t)}</h3><div class="meta">${esc(e.meta)} · ${esc(e.topic)}</div><a href="#/producto/${e.prod}">Productos mencionados →</a></div>
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
      <div class="ctas"><button class="btn" data-act="play" data-i="0">▶ Último episodio</button>${ext('Spotify')}${ext('Apple')}${ext('YouTube')}</div></div>
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
    '<a href="#/podcast" data-nav="podcast">Podcast</a><a href="#/ofertas" class="offers" data-nav="ofertas">Ofertas</a>';
}
function openMega(k) {
  const m = D.mega[k], box = $('#mega');
  if (!m) { closeMega(); return; }
  if (ui.mega === k) return;
  ui.mega = k;
  const p = P(m.promo.id);
  box.innerHTML = m.cols.map(c => `<div><h3>${esc(c.t)}</h3><ul>${c.l.map(l => `<li><a href="${catHref(k, l)}">${esc(l)}</a></li>`).join('')}</ul></div>`).join('') +
    `<a class="promo-card" href="#/producto/${p.id}" style="background:${p.tone}"><div class="ph" aria-hidden="true">[foto destacada]</div>
      <div class="txt"><div class="eyebrow">Destacado</div><div class="name">${esc(p.name)}</div><div class="sub">${esc(m.promo.s)}</div></div></a>`;
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
    const subs = [...new Set(D.products.filter(p => p.cat === c).map(p => p.sub))];
    return `<div class="d-item"><button data-act="d-acc" aria-expanded="false" aria-controls="ds-${i}"><span>${esc(c)}</span><span aria-hidden="true">⌄</span></button>
      <div class="d-sub" id="ds-${i}" hidden>${subs.map(s => `<a href="${catHref(c, s)}" data-act="drawer-close">${esc(s)}</a>`).join('')}<a href="${catHref(c)}" data-act="drawer-close"><b>Ver todo ${esc(c)}</b></a></div></div>`;
  }).join('') +
    `<div class="d-item"><a href="#/podcast" data-act="drawer-close">🎙 Podcast</a></div>
     <div class="d-item"><a href="#/ofertas" data-act="drawer-close" style="color:var(--plum)">Ofertas</a></div>
     <div class="d-foot"><a href="#" data-act="account">Mi cuenta · Mis pedidos</a><a href="#/ayuda/envios" data-act="drawer-close">Ayuda</a><a href="#" data-act="wa">WhatsApp</a></div>`;
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
    case 'buscar': r = pageSearch(seg[1] || ''); break;
    case 'producto': r = pageProduct(seg[1]); break;
    case 'carrito': r = pageCart(); break;
    case 'checkout': r = pageCheckout(); break;
    case 'podcast': r = pagePodcast(); break;
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
  account() { toast('Las cuentas de cliente estarán disponibles pronto'); closeDrawer(); },
  toast(el) { toast(el.dataset.msg); },
  wa(el) { window.open(waLink(el.dataset.msg), '_blank', 'noopener'); },
  social(el) {
    const url = C.social[el.dataset.net];
    if (url) window.open(url, '_blank', 'noopener'); else toast('Enlace de ' + el.dataset.net + ' próximamente');
  },
  'pdp-qty'(el) { const p = P(currentProductId()); ui.pdp.qty = Math.max(1, Math.min(p.stock, ui.pdp.qty + (+el.dataset.d))); syncPDP(); },
  'pdp-opt'(el) { ui.pdp.opt = el.dataset.v; syncPDP(); },
  'pdp-img'(el) { ui.pdp.img = +el.dataset.i; syncPDP(); },
  'pdp-add'() { addToCart(currentProductId(), ui.pdp.opt, ui.pdp.qty); location.hash = '#/carrito'; },
  'pdp-buy'() { addToCart(currentProductId(), ui.pdp.opt, ui.pdp.qty); ui.co.step = 1; location.hash = '#/checkout'; },
  'line-qty'(el) { const l = cart[+el.dataset.i], p = P(l.id); l.qty = Math.max(1, Math.min(p.stock, l.qty + (+el.dataset.d))); saveCart(); rerenderKeepFocus(); },
  'line-rm'(el) { cart.splice(+el.dataset.i, 1); saveCart(); render(true); },
  'to-checkout'() { ui.co.step = 1; },
  'pick-ship'(el) { ui.co.ship = el.dataset.k; if (ui.co.ship === 'prov' && ui.co.pay === 'cod') ui.co.pay = 'card'; ui.co.err = {}; rerenderKeepFocus(); },
  'pick-pay'(el) { if (ui.co.pay !== el.dataset.k) { ui.co.pay = el.dataset.k; rerenderKeepFocus(); } },
  'goto-step1'() { ui.co.step = 1; ui.co.err = {}; render(); },
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
  if (el.dataset.act === 'wa' || el.dataset.act === 'social' || el.dataset.act === 'account') e.preventDefault();
  fn(el);
});

/* ---------- formularios y filtros ---------- */
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.co) ui.co.f[t.dataset.co] = t.value;
  if (t.id === 'cc-num') { const d = t.value.replace(/\D/g, '').slice(0, 19); t.value = d.replace(/(.{4})/g, '$1 ').trim(); }
  if (t.id === 'cc-exp') { let d = t.value.replace(/\D/g, '').slice(0, 4); if (d.length > 2) d = d.slice(0, 2) + '/' + d.slice(2); t.value = d; }
  if (t.dataset.f === 'min') { F.min = +t.value; if (F.min > F.max) { F.max = F.min; $('[data-f=max]').value = F.max; } updateGrid(); }
  if (t.dataset.f === 'max') { F.max = +t.value; if (F.max < F.min) { F.min = F.max; $('[data-f=min]').value = F.min; } updateGrid(); }
});
document.addEventListener('change', e => {
  const t = e.target, f = t.dataset.f;
  if (t.dataset.coCheck) { ui.co[t.dataset.coCheck] = t.checked; if (t.dataset.coCheck === 'ruc') { ui.co.err = {}; render(true); } return; }
  if (!f || !F) return;
  if (f === 'sub') { t.checked ? F.subs.add(t.value) : F.subs.delete(t.value); }
  if (f === 'subs-all') { F.subs.clear(); }
  if (f === 'age') { t.checked ? F.ages.add(t.value) : F.ages.delete(t.value); }
  if (f === 'offers') F.offers = t.checked;
  if (f === 'sort') F.sort = t.value;
  updateGrid();
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
    const code = new FormData(form).get('code').trim().toUpperCase();
    if (!code) { coupon = ''; ui.couponMsg = null; }
    else if (C.coupons[code]) { coupon = code; ui.couponMsg = { ok: true, t: `Cupón ${code} aplicado: ${Math.round(C.coupons[code] * 100)}% de descuento` }; }
    else { coupon = ''; ui.couponMsg = { ok: false, t: 'El cupón no es válido' }; }
    saveCart(); render(true); return;
  }
  if (kind === 'step1') {
    const bad = validateStep1();
    if (bad.length) { render(true); const n = $('#f-' + bad[0]); if (n) n.focus(); return; }
    ui.co.step = 2; render(); return;
  }
  if (kind === 'step2') {
    const st = ui.co; st.err = {};
    if (st.ruc) { ['ruc', 'razon'].forEach(k => { const v = (st.f[k] || '').trim(); if (!v) st.err[k] = 'Completa este campo'; else if (FIELDS[k].test && !FIELDS[k].test(v)) st.err[k] = FIELDS[k].msg; }); }
    if (!st.agree) st.err.agree = 'Debes aceptar los términos para continuar';
    if (st.pay === 'card') {
      const num = $('#cc-num').value.replace(/\D/g, ''), exp = $('#cc-exp').value, cvv = $('#cc-cvv').value, nm = $('#cc-name').value.trim();
      if (num.length < 13 || !/^(0[1-9]|1[0-2])\/\d{2}$/.test(exp) || !/^\d{3,4}$/.test(cvv) || !nm) { toast('Revisa los datos de tu tarjeta'); (num.length < 13 ? $('#cc-num') : !/^(0[1-9]|1[0-2])\/\d{2}$/.test(exp) ? $('#cc-exp') : !/^\d{3,4}$/.test(cvv) ? $('#cc-cvv') : $('#cc-name')).focus(); return; }
    }
    if (Object.keys(st.err).length) { render(true); const n = $('#f-' + Object.keys(st.err)[0]) || $('#agree'); if (n) n.focus(); return; }
    const t = totals(st.ship), n = store.get('mv_order_n', 122) + 1; store.set('mv_order_n', n);
    st.order = { no: String(n).padStart(6, '0'), email: st.f.email, eta: st.ship === 'lima' ? '2–4 días' : st.ship === 'prov' ? '4–7 días' : '24 horas', ship: D.shipping[st.ship].l, pay: D.payments[st.pay].l, total: t.total };
    cart = []; coupon = ''; ui.couponMsg = null; saveCart(); st.step = 3; render(); return;
  }
});

/* ---------- arranque ---------- */
$('#year').textContent = new Date().getFullYear();
buildNav(); buildDrawer(); updateCartCount(); render();
})();
