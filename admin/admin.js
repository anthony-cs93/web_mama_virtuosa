(() => {
'use strict';

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => 'S/ ' + Number(n).toFixed(2);
const clone = o => JSON.parse(JSON.stringify(o));
const view = $('#view'), dlg = $('#dlg');
const TONES = ['#fdd9ea', '#e8d5e6', '#fbbad9', '#dcd5fb', '#fcf3c0', '#f8dcc6', '#d9fcd5', '#c8fcf4'];
const AGES = ['0–1', '1–3', '3–6'];

let toastTimer;
function toast(msg, bad) {
  const t = $('#toast');
  t.textContent = msg; t.classList.toggle('bad', !!bad); t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), bad ? 4500 : 2500);
}


/* ---------- ventana de confirmación (reemplaza a confirm()) ---------- */
const cfm = $('#cfm');
const CFM_ICONS = {
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  out: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  warn: '<path d="M12 4l9 16H3L12 4zM12 10v4M12 17v.5"/>'
};
/* ask({ title, message (HTML ya escapado), confirmText, cancelText (null = solo informar), danger, icon, input })
   Sin input devuelve true/false; con input devuelve el texto escrito o null. */
function ask({ title, message = '', confirmText = 'Aceptar', cancelText = 'Cancelar', danger = false, icon = 'info', input = null }) {
  return new Promise(resolve => {
    cfm.innerHTML = `<form method="dialog" class="cfm-box" novalidate>
      <div class="cfm-ico${danger ? ' danger' : ''}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${CFM_ICONS[icon] || CFM_ICONS.info}</svg></div>
      <h2 id="cfm-t">${esc(title)}</h2>
      ${message ? `<p id="cfm-m">${message}</p>` : ''}
      ${input ? `<label class="fld cfm-in"><span>${esc(input.label)}</span><input type="text" id="cfm-in" value="${esc(input.value)}" maxlength="${input.max || 80}"></label><div class="form-err" id="cfm-err" role="alert"></div>` : ''}
      <div class="cfm-actions">${cancelText ? `<button type="button" class="btn ghost" data-no>${esc(cancelText)}</button>` : ''}<button type="submit" class="btn${danger ? ' danger' : ''}" id="cfm-ok">${esc(confirmText)}</button></div>
    </form>`;
    cfm.setAttribute('aria-labelledby', 'cfm-t');
    if (message) cfm.setAttribute('aria-describedby', 'cfm-m'); else cfm.removeAttribute('aria-describedby');
    const none = input ? null : false;
    let done = false;
    const finish = v => { if (done) return; done = true; resolve(v); };
    const f = $('form', cfm);
    f.addEventListener('submit', e => {
      e.preventDefault();
      if (input) {
        const v = $('#cfm-in').value.trim();
        if (!v) { $('#cfm-err').textContent = 'Escribe un nombre.'; $('#cfm-in').focus(); return; }
        cfm.close(); finish(v);
      } else { cfm.close(); finish(true); }
    });
    const no = $('[data-no]', cfm); if (no) no.addEventListener('click', () => { cfm.close(); finish(none); });
    cfm.addEventListener('close', () => finish(none), { once: true });
    cfm.showModal();
    // En acciones destructivas el foco empieza en «Cancelar», para evitar borrados por accidente
    const first = input ? $('#cfm-in') : (danger && no ? no : $('#cfm-ok'));
    first.focus(); if (input) first.select();
  });
}
cfm.addEventListener('click', e => { if (e.target === cfm) cfm.close(); });

async function api(method, url, body) {
  const r = await fetch(url, {
    method, credentials: 'same-origin',
    headers: { 'X-Requested-With': 'mv-admin', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let j = {}; try { j = await r.json(); } catch { /* sin cuerpo */ }
  if (!r.ok) {
    if (r.status === 401 && url !== '/api/login') showLogin();
    const e = new Error(j.error || 'Error ' + r.status); e.status = r.status; throw e;
  }
  return j;
}

/* ---------- estado ---------- */
let S = null;                 // { config, data }
let dirty = false;
let tab = 'productos';
const flagged = new Set();    // ids destacados en el inicio
const filter = { q: '', cat: '' };

const D = () => S.data;
function markDirty() {
  dirty = true;
  $('#save').disabled = false; $('#dirty').hidden = false;
}
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

function normalize() {
  const d = D();
  d.featured = d.featured || [];
  d.heroes = d.heroes || [];
  d.catFilter = d.catFilter || {};
  d.catGoals = d.catGoals || {};
  if (d.goals && d.goals.length) {   // datos antiguos: una lista global → pasa a las categorías que la usaban
    d.catOrder.forEach(c => { if ((d.catFilter[c] || {}).goals && !d.catGoals[c]) d.catGoals[c] = [...d.goals]; });
  }
  delete d.goals;
  Object.values(d.catFilter).forEach(f => { if (f) delete f.goals; });
  d.hero = { ...clone(DEFAULT_HERO), ...(d.hero || {}) };
  flagged.clear(); d.featured.forEach(id => flagged.add(id));
  d.episodes.forEach(e => { if (e.date === undefined) e.date = (e.meta || '').split(' · ')[1] || ''; });
  d.catOrder.forEach(c => { d.mega[c] = d.mega[c] || { cols: [], promo: null }; d.mega[c].cols = d.mega[c].cols || []; });
}

function payload() {
  const out = clone(S), d = out.data;
  d.featured = d.products.filter(p => flagged.has(p.id)).map(p => p.id);
  d.episodes.forEach(e => {
    const mins = Math.max(1, Math.round((e.secs || 0) / 60));
    e.meta = mins + ' min' + (e.date ? ' · ' + e.date : '');
    if (!e.audio) delete e.audio;
    if (!e.prod) delete e.prod;
  });
  d.products.forEach(p => {
    if (p.imgs && p.imgs.length) p.img = p.imgs[0]; else { delete p.img; delete p.imgs; }
    if (!p.opt) delete p.opt;
  });
  Object.keys(d.catFilter).forEach(k => { const f = d.catFilter[k]; if (!d.catOrder.includes(k) || !f || (!f.label && !(f.options && f.options.length))) delete d.catFilter[k]; });
  Object.keys(d.catGoals).forEach(k => { if (!d.catOrder.includes(k) || !(d.catGoals[k] || []).length) delete d.catGoals[k]; });
  d.products.forEach(p => { const list = d.catGoals[p.cat] || []; p.goals = (p.goals || []).filter(g => list.includes(g)); if (!p.goals.length) delete p.goals; });
  d.heroes.forEach(h => { if (!h.cta1) delete h.cta1; if (!h.cta2) delete h.cta2; });
  if (!d.hero.cta1) delete d.hero.cta1;
  if (!d.hero.cta2) delete d.hero.cta2;
  d.catOrder.forEach(c => { if (d.mega[c] && !d.mega[c].promo) delete d.mega[c].promo; });
  Object.keys(d.mega).forEach(k => { if (!d.catOrder.includes(k)) delete d.mega[k]; });
  return out;
}

async function save() {
  const btn = $('#save'); btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    await api('PUT', '/api/store', payload());
    dirty = false; $('#dirty').hidden = true;
    toast('Guardado. La tienda lo mostrará en menos de un minuto.');
  } catch (e) { btn.disabled = false; toast(e.message, true); }
  btn.textContent = 'Guardar cambios';
}

/* ---------- sesión ---------- */
const bootEl = $('#boot');
const bootOn = msg => { $('#boot-t').textContent = msg || 'Cargando panel…'; bootEl.hidden = false; };
const bootOff = () => { bootEl.hidden = true; };
function showLogin() {
  bootOff();
  $('#shell').hidden = true; $('#login').hidden = false;
  $('#login-title').textContent = 'Panel de administración';
  $('#login-sub').textContent = 'Ingresa tu contraseña para continuar.';
  $('#login-pw').value = ''; $('#login-err').textContent = '';
  $('#login-pw').focus();
}
$('#pw-eye').addEventListener('click', e => {
  const pw = $('#login-pw'), show = pw.type === 'password';
  pw.type = show ? 'text' : 'password';
  e.currentTarget.setAttribute('aria-pressed', show);
  e.currentTarget.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
  $('.eye-on', e.currentTarget).hidden = show; $('.eye-off', e.currentTarget).hidden = !show;
  pw.focus();
});
function loginBusy(on) {
  const b = $('#login-btn');
  b.setAttribute('aria-busy', on); b.disabled = on;
  $('.spin', b).hidden = !on; $('#login-btn-t').textContent = on ? 'Entrando…' : 'Entrar';
}
$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  $('#login-err').textContent = ''; loginBusy(true);
  try {
    await api('POST', '/api/login', { password: $('#login-pw').value });
    bootOn('Abriendo tu panel…'); $('#login').hidden = true;
    await boot();
  } catch (err) { bootOff(); $('#login').hidden = false; $('#login-err').textContent = err.message; }
  loginBusy(false);
});
$('#logout').addEventListener('click', async () => {
  if (dirty && !await ask({ title: '¿Salir sin guardar?', message: 'Tienes cambios sin guardar. Si sales ahora, <b>se perderán</b>.', confirmText: 'Salir sin guardar', cancelText: 'Seguir editando', danger: true, icon: 'out' })) return;
  dirty = false;
  try { await api('POST', '/api/logout', {}); } catch { /* ya cerrada */ }
  location.reload();
});

async function boot() {
  bootOn();
  const st = await (await fetch('/api/session', { credentials: 'same-origin' })).json();
  if (!st.auth) { showLogin(); return; }
  S = await api('GET', '/api/store');
  normalize();
  $('#login').hidden = true; $('#shell').hidden = false;
  render(); bootOff();
}

/* ---------- pestañas ---------- */
$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]'); if (!b) return;
  tab = b.dataset.tab;
  $$('#tabs button').forEach(x => x.classList.toggle('on', x === b));
  render();
});
$('#save').addEventListener('click', save);
function render() {
  if (!S) return;
  ({ productos: renderProducts, categorias: renderCats, portada: renderHero, podcast: renderPodcast, ajustes: renderSettings })[tab]();
}

/* ---------- reordenar (arrastrar) ---------- */
function sortable(box, onMove) {
  if (!box) return;
  let from = null;
  box.addEventListener('pointerdown', e => { const g = e.target.closest('.grip'); if (g) g.closest('.row').draggable = true; });
  box.addEventListener('dragstart', e => {
    const r = e.target.closest('.row'); if (!r || !r.draggable) return;
    from = +r.dataset.i; r.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', '');
  });
  box.addEventListener('dragover', e => {
    if (from === null) return; e.preventDefault();
    $$('.drag-over', box).forEach(x => x.classList.remove('drag-over'));
    const r = e.target.closest('.row'); if (r) r.classList.add('drag-over');
  });
  box.addEventListener('drop', e => {
    e.preventDefault();
    const r = e.target.closest('.row');
    if (r && from !== null && +r.dataset.i !== from) onMove(from, +r.dataset.i);
    from = null;
  });
  box.addEventListener('dragend', () => { from = null; $$('.row', box).forEach(r => { r.draggable = false; r.classList.remove('dragging', 'drag-over'); }); });
}
function moveIn(arr, from, to) { const [x] = arr.splice(from, 1); arr.splice(to, 0, x); }

/* ---------- imágenes y audio ---------- */
async function prepImage(file) {
  if (file.type === 'image/gif') return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.86));
    if (blob && (k < 1 || blob.size < file.size)) return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch { /* se sube tal cual */ }
  return file;
}
/* Sube directo a Vercel Blob (el servidor solo entrega un permiso firmado) y devuelve la URL pública */
const BLOB_CLIENT = '/admin/blob-client.js';
async function upload(kind, file) {
  const dot = file.name.lastIndexOf('.');
  const stem = file.name.slice(0, dot < 0 ? undefined : dot).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'archivo';
  const ext = dot < 0 ? '' : file.name.slice(dot).toLowerCase();
  try {
    const { upload: blobUpload } = await import(BLOB_CLIENT);
    const b = await blobUpload(({ image: 'img/products/', hero: 'img/hero/', audio: 'audio/' })[kind] + stem + ext, file, { access: 'public', handleUploadUrl: '/api/upload' });
    return b.url;
  } catch (e) { throw new Error('No se pudo subir el archivo: ' + e.message); }
}
const src = u => (/^(https?:)?\/\//.test(u) ? u : '/' + u);

/* =====================================================================
   PRODUCTOS
   ===================================================================== */
function visibleProducts() {
  const q = filter.q.trim().toLowerCase();
  return D().products.filter(p => (!filter.cat || p.cat === filter.cat) && (!q || (p.name + ' ' + p.cat + ' ' + p.sub).toLowerCase().includes(q)));
}
function renderProducts() {
  const d = D(), vis = visibleProducts();
  const reorderable = true;
  view.innerHTML = `
  <div class="sec-head"><div><h1>Productos</h1>
    <p class="muted">${d.products.length} en total · ${flagged.size} destacados en el inicio (se muestran hasta 8). Arrastra ⋮⋮ o usa las flechas para cambiar el orden en que se muestran.</p></div>
    <button class="btn" data-act="p-new">+ Nuevo producto</button></div>
  <div class="toolbar">
    <input type="search" id="p-q" placeholder="Buscar producto…" aria-label="Buscar producto" value="${esc(filter.q)}">
    <select id="p-cat" aria-label="Filtrar por categoría"><option value="">Todas las categorías</option>
      ${d.catOrder.map(c => `<option${filter.cat === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>
  </div>
  <div class="rows" id="p-rows">${vis.length ? vis.map((p, i) => `
    <div class="row" data-i="${i}" data-id="${p.id}">
      <button class="grip" aria-hidden="true" tabindex="-1" title="Arrastrar">⋮⋮</button>
      <div class="thumb" style="background:${esc(p.tone)}">${(p.imgs && p.imgs[0]) ? `<img src="${esc(src(p.imgs[0]))}" alt="" loading="lazy">` : 'sin foto'}</div>
      <div class="main"><div class="nm">${esc(p.name)}${p.tag ? `<span class="pill">${esc(p.tag)}</span>` : ''}</div>
        <div class="sub">${esc(p.cat)} · ${esc(p.sub || 'sin subcategoría')}</div></div>
      <div class="num">${fmt(p.price)}${p.old ? `<s>${fmt(p.old)}</s>` : ''}</div>
      <div class="stock ${p.stock <= 5 ? 'low' : ''}">${p.stock > 0 ? p.stock + ' en stock' : 'Agotado'}</div>
      <div class="acts">
        <button class="icon-btn ${flagged.has(p.id) ? 'on' : ''}" data-act="p-star" title="Destacar en el inicio" aria-label="Destacar en el inicio" aria-pressed="${flagged.has(p.id)}">★</button>
        <button class="icon-btn" data-act="p-up" aria-label="Subir" title="Subir"${i === 0 ? ' disabled' : ''}>↑</button>
        <button class="icon-btn" data-act="p-down" aria-label="Bajar" title="Bajar"${i === vis.length - 1 ? ' disabled' : ''}>↓</button>
        <button class="icon-btn" data-act="p-edit" aria-label="Editar ${esc(p.name)}" title="Editar">✎</button>
        <button class="icon-btn" data-act="p-dup" aria-label="Duplicar" title="Duplicar">⧉</button>
        <button class="icon-btn" data-act="p-del" aria-label="Eliminar" title="Eliminar">🗑</button>
      </div>
    </div>`).join('') : '<div class="empty">No hay productos que coincidan.</div>'}</div>`;
  $('#p-q').addEventListener('input', e => { filter.q = e.target.value; const pos = e.target.selectionStart; renderProducts(); const n = $('#p-q'); n.focus(); n.setSelectionRange(pos, pos); });
  $('#p-cat').addEventListener('change', e => { filter.cat = e.target.value; renderProducts(); });
  if (reorderable) sortable($('#p-rows'), (a, b) => moveVisible(a, b));
}
/* Mueve entre los productos visibles; ocupan los mismos lugares que tenían en la lista general */
function moveVisible(from, to) {
  const vis = visibleProducts(), all = D().products;
  const slots = vis.map(p => all.indexOf(p));
  moveIn(vis, from, to);
  vis.forEach((p, k) => { all[slots[k]] = p; });
  markDirty(); renderProducts();
}
const pById = id => D().products.find(p => p.id === id);
const nextId = () => D().products.reduce((m, p) => Math.max(m, p.id), 0) + 1;

view.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const row = b.closest('.row'), act = b.dataset.act;
  if (act.startsWith('p-')) {
    if (act === 'p-new') return productDialog(null);
    const p = pById(+row.dataset.id), i = +row.dataset.i;
    if (act === 'p-edit') productDialog(p);
    if (act === 'p-star') { flagged.has(p.id) ? flagged.delete(p.id) : flagged.add(p.id); markDirty(); renderProducts(); }
    if (act === 'p-up') moveVisible(i, i - 1);
    if (act === 'p-down') moveVisible(i, i + 1);
    if (act === 'p-dup') {
      ask({ title: 'Duplicar producto', message: `Se creará una copia de <b>${esc(p.name)}</b>, con sus fotos y datos, justo debajo.`, confirmText: 'Duplicar', icon: 'copy', input: { label: 'Nombre de la copia', value: p.name + ' (copia)' } }).then(name => {
        if (!name) return;
        const c = clone(p); c.id = nextId(); c.name = name;
        D().products.splice(D().products.indexOf(p) + 1, 0, c); markDirty(); renderProducts(); toast('Producto duplicado');
      });
    }
    if (act === 'p-del') {
      const d = D(), where = [];
      if (flagged.has(p.id)) where.push('«Más vendidos» del inicio');
      if (Object.values(d.mega).some(m => m.promo && m.promo.id === p.id)) where.push('el destacado de un menú');
      const eps = d.episodes.filter(ep => ep.prod === p.id).length;
      if (eps) where.push(`${eps} episodio${eps === 1 ? '' : 's'} del podcast`);
      ask({ title: '¿Eliminar producto?', message: `<b>${esc(p.name)}</b> dejará de mostrarse en la tienda.${where.length ? `<br>También se quitará de: ${where.join(', ')}.` : ''}<br>Esta acción se aplica al guardar los cambios.`, confirmText: 'Eliminar', danger: true, icon: 'trash' }).then(ok => {
        if (!ok) return;
        d.products = d.products.filter(x => x !== p); flagged.delete(p.id);
        Object.values(d.mega).forEach(m => { if (m.promo && m.promo.id === p.id) m.promo = null; });
        d.episodes.forEach(ep => { if (ep.prod === p.id) delete ep.prod; });
        markDirty(); renderProducts();
      });
    }
    return;
  }
  if (act.startsWith('c-')) return catClick(b, act);
  if (act.startsWith('g-')) return goalClick(b, act);
  if (act.startsWith('e-')) return podClick(b, act);
  if (act.startsWith('s-')) return setClick(b, act);
  if (act.startsWith('h-')) return heroClick(b, act);
});

const goalsOf = cat => (D().catGoals || {})[cat] || [];
/* Sugerencias de subcategoría: las opciones del filtro de la categoría + las que ya usan sus productos */
function subOptions(cat) {
  const set = new Set(((D().catFilter || {})[cat] || {}).options || []);
  D().products.filter(p => p.cat === cat).forEach(p => p.sub && set.add(p.sub));
  return [...set];
}

function productDialog(p) {
  const isNew = !p, d = D();
  const draft = isNew
    ? { name: '', cat: filter.cat || d.catOrder[0], sub: '', price: 0, old: 0, tag: '', tone: TONES[0], stock: 10, ages: [], desc: '', care: '', imgs: [] }
    : clone(p);
  draft.imgs = draft.imgs || (draft.img ? [draft.img] : []);
  let star = !isNew && flagged.has(p.id);
  dlg.innerHTML = `<form method="dialog" id="pf" novalidate>
    <div class="dlg-head"><h2 id="dlg-title">${isNew ? 'Nuevo producto' : 'Editar producto'}</h2><button type="button" class="icon-btn" data-close aria-label="Cerrar">✕</button></div>
    <div class="dlg-body">
      <label class="fld"><span>Nombre *</span><input type="text" name="name" value="${esc(draft.name)}" required maxlength="80"></label>
      <div class="grid2">
        <label class="fld"><span>Categoría *</span><small>La sección de la tienda donde aparece.</small><select name="cat">${d.catOrder.map(c => `<option${c === draft.cat ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <div class="fld" id="sub-fld"></div>
      </div>
      <div class="grid4">
        <label class="fld"><span>Precio (S/) *</span><input type="number" name="price" min="0" step="0.10" value="${draft.price}" required></label>
        <label class="fld"><span>Precio antes (S/)</span><input type="number" name="old" min="0" step="0.10" value="${draft.old || ''}" placeholder="Sin oferta"><small>Si lo llenas, se ve tachado</small></label>
        <label class="fld"><span>Stock</span><input type="number" name="stock" min="0" step="1" value="${draft.stock}"></label>
        <label class="fld"><span>Etiqueta</span><input type="text" name="tag" list="tags" value="${esc(draft.tag)}" maxlength="14"><datalist id="tags"><option>Nuevo</option><option>Top</option><option>-20%</option><option>Oferta</option></datalist><small>«Top» sube en «Más vendidos»</small></label>
      </div>
      <div class="fld"><span>Color de fondo (si no hay foto)</span>
        <div class="swatches" id="tone-sw">${TONES.map(t => `<button type="button" style="background:${t}" data-tone="${t}" aria-label="Color ${t}" aria-pressed="${t === draft.tone}"></button>`).join('')}
          <input type="color" id="tone-c" value="${/^#[0-9a-f]{6}$/i.test(draft.tone) ? draft.tone : '#fdd9ea'}" aria-label="Otro color"></div>
        <input type="hidden" name="tone" value="${esc(draft.tone)}"></div>
      <div class="fld"><span>Edad del niño (opcional)</span>
        <div class="chips">${AGES.map(a => `<label><input type="checkbox" name="ages" value="${a}"${draft.ages.includes(a) ? ' checked' : ''}><span>${a} años</span></label>`).join('')}</div></div>
      <div class="fld" id="goals-fld" hidden><span>Por beneficio <small>(puedes marcar varios · solo en categorías que tengan este filtro)</small></span><div class="chips" id="goals-chips"></div></div>
      <div class="grid2">
        <label class="fld"><span>Opción (ej. Talla, Color)</span><input type="text" name="optLabel" value="${esc(draft.opt ? draft.opt.label : '')}" maxlength="20"></label>
        <label class="fld"><span>Valores, separados por coma</span><input type="text" name="optValues" value="${esc(draft.opt ? draft.opt.values.join(', ') : '')}" placeholder="0–6m, 6–12m, 1–2a"></label>
      </div>
      <label class="fld"><span>Descripción</span><textarea name="desc" rows="3">${esc(draft.desc)}</textarea></label>
      <label class="fld"><span>Medidas y cuidados</span><textarea name="care" rows="2">${esc(draft.care)}</textarea></label>
      <div class="fld"><span>Fotos <small>(la primera es la principal; se reducen a 1400 px automáticamente)</small></span><div class="gallery" id="gal"></div></div>
      <label class="check"><input type="checkbox" name="star"${star ? ' checked' : ''}> Mostrar en «Más vendidos» del inicio</label>
      <div class="form-err" id="pf-err" role="alert"></div>
    </div>
    <div class="dlg-foot"><span></span><div class="r"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="submit" class="btn">${isNew ? 'Agregar producto' : 'Aplicar'}</button></div></div>
  </form>`;
  const f = $('#pf');
  /* Campo de subcategoría: usa el nombre y las opciones que se configuraron en Categorías → Filtro de subcategorías */
  let subVal = draft.sub || '';
  const drawSub = () => {
    const cat = f.cat.value, cf = (D().catFilter || {})[cat] || {}, opts = cf.options || [], label = cf.label || 'Subcategoría';
    const box = $('#sub-fld');
    if (opts.length) {
      const extra = subVal && !opts.includes(subVal) ? [subVal] : [];
      box.innerHTML = `<span>${esc(label)}</span><small>Una sola opción. Las opciones se configuran en Categorías → ${esc(cat)} → Filtro de subcategorías.</small>
        <select name="sub"><option value="">Ninguna</option>${[...opts, ...extra].map(o => `<option value="${esc(o)}"${o === subVal ? ' selected' : ''}>${esc(o)}${extra.includes(o) ? ' (ya no está en las opciones)' : ''}</option>`).join('')}</select>`;
      $('select', box).addEventListener('change', e => { subVal = e.target.value; });
    } else {
      box.innerHTML = `<span>${esc(label)}</span><small>Una sola. Para elegirla de una lista, escribe las opciones en Categorías → ${esc(cat)} → Filtro de subcategorías.</small>
        <input type="text" name="sub" list="subs" value="${esc(subVal)}" maxlength="40"><datalist id="subs">${subOptions(cat).map(o => `<option>${esc(o)}</option>`).join('')}</datalist>`;
      $('input', box).addEventListener('input', e => { subVal = e.target.value; });
    }
  };
  drawSub();
  f.cat.addEventListener('change', () => {
    if (subVal && !subOptions(f.cat.value).includes(subVal)) subVal = '';   // la subcategoría anterior no existe en la nueva categoría
    drawSub();
  });
  const selGoals = new Set(draft.goals || []);
  const drawGoals = () => {
    const list = goalsOf(f.cat.value);
    $('#goals-fld').hidden = !list.length;
    $('#goals-chips').innerHTML = list.map(g => `<label><input type="checkbox" name="goals" value="${esc(g)}"${selGoals.has(g) ? ' checked' : ''}><span>${esc(g)}</span></label>`).join('');
  };
  drawGoals(); f.cat.addEventListener('change', drawGoals);
  $('#goals-chips').addEventListener('change', e => { e.target.checked ? selGoals.add(e.target.value) : selGoals.delete(e.target.value); });

  const setTone = t => { f.tone.value = t; $$('#tone-sw button').forEach(b => b.setAttribute('aria-pressed', b.dataset.tone === t)); };
  $('#tone-sw').addEventListener('click', e => { const b = e.target.closest('[data-tone]'); if (b) setTone(b.dataset.tone); });
  $('#tone-c').addEventListener('input', e => setTone(e.target.value));

  const gal = $('#gal');
  function drawGallery() {
    gal.innerHTML = draft.imgs.map((u, i) => `<div class="g-item${i === 0 ? ' main' : ''}" data-i="${i}">
      ${i === 0 ? '<span class="tagm">Principal</span>' : ''}<img src="${esc(src(u))}" alt="Foto ${i + 1}">
      <div class="bar"><button type="button" data-g="left" aria-label="Mover a la izquierda"${i === 0 ? ' disabled' : ''}>◀</button>
        <button type="button" data-g="del" aria-label="Quitar foto">🗑</button>
        <button type="button" data-g="right" aria-label="Mover a la derecha"${i === draft.imgs.length - 1 ? ' disabled' : ''}>▶</button></div></div>`).join('') +
      `<label class="drop" id="drop" tabindex="0">+ Subir fotos<input type="file" accept="image/*" multiple hidden></label>`;
  }
  drawGallery();
  gal.addEventListener('click', e => {
    const b = e.target.closest('[data-g]'); if (!b) return;
    const i = +b.closest('.g-item').dataset.i;
    if (b.dataset.g === 'del') draft.imgs.splice(i, 1);
    if (b.dataset.g === 'left') moveIn(draft.imgs, i, i - 1);
    if (b.dataset.g === 'right') moveIn(draft.imgs, i, i + 1);
    drawGallery();
  });
  async function addFiles(files) {
    const drop = $('#drop');
    for (const file of files) {
      if (!file.type.startsWith('image/')) { toast('«' + file.name + '» no es una imagen', true); continue; }
      drop.firstChild.textContent = 'Subiendo…';
      try { draft.imgs.push(await upload('image', await prepImage(file))); } catch (err) { toast(err.message, true); }
      drawGallery();
    }
  }
  gal.addEventListener('change', e => { if (e.target.type === 'file') { addFiles([...e.target.files]); e.target.value = ''; } });
  gal.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.id === 'drop') { e.preventDefault(); e.target.querySelector('input').click(); } });
  gal.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); $('#drop').classList.add('over'); } });
  gal.addEventListener('dragleave', () => $('#drop') && $('#drop').classList.remove('over'));
  gal.addEventListener('drop', e => { if (e.dataTransfer.files.length) { e.preventDefault(); addFiles([...e.dataTransfer.files]); } });

  f.addEventListener('submit', e => {
    e.preventDefault();
    const v = new FormData(f), err = m => { $('#pf-err').textContent = m; };
    const name = String(v.get('name')).trim(), price = parseFloat(v.get('price')), old = parseFloat(v.get('old')) || 0, stock = parseInt(v.get('stock'), 10);
    if (!name) return err('Escribe el nombre del producto.');
    if (!(price >= 0) || Number.isNaN(price)) return err('Escribe un precio válido.');
    if (old && old <= price) return err('El «precio antes» debe ser mayor que el precio actual (o déjalo vacío).');
    const optValues = v.get('optValues').split(',').map(s => s.trim()).filter(Boolean), optLabel = v.get('optLabel').trim();
    if (optValues.length && !optLabel) return err('Ponle un nombre a la opción (ej. Talla).');
    const out = {
      ...(isNew ? {} : p),
      id: isNew ? nextId() : p.id, name, cat: v.get('cat'), sub: v.get('sub').trim(),
      price: Math.round(price * 100) / 100, old: Math.round(old * 100) / 100, tag: v.get('tag').trim(), tone: v.get('tone'),
      stock: Number.isNaN(stock) ? 0 : Math.max(0, stock), ages: v.getAll('ages'), goals: goalsOf(v.get('cat')).filter(g => selGoals.has(g)),
      desc: v.get('desc').trim(), care: v.get('care').trim(), imgs: draft.imgs
    };
    if (optValues.length) out.opt = { label: optLabel, values: optValues }; else delete out.opt;
    if (isNew) D().products.unshift(out); else D().products[D().products.indexOf(p)] = out;
    v.get('star') ? flagged.add(out.id) : flagged.delete(out.id);
    markDirty(); dlg.close(); renderProducts();
    toast(isNew ? 'Producto agregado. Recuerda guardar los cambios.' : 'Cambios aplicados. Recuerda guardar.');
  });
  dlg.showModal(); f.elements.name.focus();
}
dlg.addEventListener('click', e => { if (e.target.closest('[data-close]')) dlg.close(); });

/* =====================================================================
   CATEGORÍAS
   ===================================================================== */
function renderCats() {
  const d = D();
  view.innerHTML = `
  <div class="sec-head"><div><h1>Categorías</h1>
    <p class="muted">Aparecen en el menú, en el inicio y como filtro. El orden de aquí es el de la tienda. Abre una categoría para editar sus datos, sus filtros y su menú.</p></div>
    <button class="btn" data-act="c-new">+ Nueva categoría</button></div>
  ${d.catOrder.map((c, i) => {
    const m = d.mega[c], n = d.products.filter(p => p.cat === c).length, cf = d.catFilter[c] || {}, gl = d.catGoals[c] || [];
    return `<details class="card" data-ci="${i}">
    <summary><span class="sw" style="background:${esc(d.catTone[c])}"></span><b>${esc(c)}</b><span class="muted small">${n} producto${n === 1 ? '' : 's'}</span></summary>
    <div class="stack">
      <h3 class="sub-h">1 · Datos de la categoría</h3>
      <div class="grid3">
        <label class="fld"><span>Nombre</span><input type="text" data-cf="name" value="${esc(c)}" maxlength="40"></label>
        <label class="fld"><span>Nombre corto</span><input type="text" data-cf="short" value="${esc(d.catShort[c] || '')}" maxlength="20"><small>Para espacios pequeños</small></label>
        <label class="fld"><span>Texto bajo el nombre</span><input type="text" data-cf="sub" value="${esc(d.catSub[c] || '')}" maxlength="60"></label>
      </div>
      <div class="fld"><span>Color de la tarjeta</span><div class="swatches">${TONES.map(t => `<button type="button" style="background:${t}" data-act="c-tone" data-t="${t}" aria-label="Color ${t}" aria-pressed="${t === d.catTone[c]}"></button>`).join('')}
        <input type="color" data-cf="tone" value="${/^#[0-9a-f]{6}$/i.test(d.catTone[c]) ? d.catTone[c] : '#fdd9ea'}" aria-label="Otro color"></div></div>

      <h3 class="sub-h">2 · Filtros en la tienda</h3>
      <div class="fbox"><b>Filtro de subcategorías</b>
        <p class="muted small">Cada producto tiene <u>una sola</u> subcategoría (ej.: Brochas, Adultos, Niños). Aquí eliges cómo se llama este filtro y qué opciones muestra.</p>
        <div class="grid2">
          <label class="fld"><span>Nombre del filtro</span><input type="text" data-cf="fLabel" value="${esc(cf.label || '')}" placeholder="Subcategoría" maxlength="30"><small>Ej.: «Por edad».</small></label>
          <label class="fld"><span>Opciones (separadas por coma)</span><input type="text" data-cf="fOpts" value="${esc((cf.options || []).join(', '))}" placeholder="Todas las subcategorías" maxlength="120"><small>Ej.: Adultos, Niños. Vacío = muestra todas las que existan.</small></label>
        </div></div>
      <div class="fbox"><b>Filtro «Por beneficio» <span class="muted small">· opcional</span></b>
        <p class="muted small">Cada producto puede tener <u>varios</u> beneficios (ej.: Sueño, Digestión). Si no agregas ninguno, este filtro no aparece en <b>${esc(c)}</b>.</p>
        <div class="rows">${gl.map((g, k) => { const cnt = d.products.filter(p => p.cat === c && (p.goals || []).includes(g)).length; return `
          <div class="row" data-gi="${k}">
            <input type="text" data-gf="name" value="${esc(g)}" maxlength="40" aria-label="Nombre del beneficio" style="flex:1;min-width:160px">
            <span class="muted small" style="min-width:100px">${cnt} producto${cnt === 1 ? '' : 's'}</span>
            <div class="acts">
              <button type="button" class="icon-btn" data-act="g-up" aria-label="Subir"${k === 0 ? ' disabled' : ''}>↑</button>
              <button type="button" class="icon-btn" data-act="g-down" aria-label="Bajar"${k === gl.length - 1 ? ' disabled' : ''}>↓</button>
              <button type="button" class="icon-btn" data-act="g-del" aria-label="Eliminar">🗑</button></div></div>`; }).join('')}</div>
        <div class="g-add-row"><input type="text" class="g-new" placeholder="Nuevo beneficio (ej. Sueño y relajación)" maxlength="40"><button type="button" class="btn sm" data-act="g-add">+ Agregar</button></div></div>

      <h3 class="sub-h">3 · Menú desplegable</h3>
      <div class="fld"><span>Columnas</span>
        <div class="cols-ed">${m.cols.map((col, k) => `<div class="col-box" data-k="${k}">
          <input type="text" data-cf="colT" value="${esc(col.t)}" placeholder="Título (ej. Cabello)" aria-label="Título de la columna">
          <input type="text" data-cf="colL" value="${esc(col.l.join(', '))}" placeholder="Brochas, Peines, Lazos" aria-label="Enlaces de la columna, separados por coma">
          <label class="check small"><input type="checkbox" data-cf="colK"${col.kind === 'goal' ? ' checked' : ''}> Estos enlaces son beneficios</label>
          <button type="button" class="link red" data-act="c-colrm" data-k="${k}">Quitar columna</button></div>`).join('')}</div>
        ${m.cols.length < 4 ? '<div><button type="button" class="link" data-act="c-coladd">+ Agregar columna</button></div>' : ''}
        <small>Cada enlace del menú lleva a los productos con esa subcategoría (o con ese beneficio, si marcas la casilla).</small></div>
      <div class="grid2">
        <label class="fld"><span>Producto destacado del menú</span><select data-cf="promoId"><option value="">Ninguno</option>
          ${d.products.map(p => `<option value="${p.id}"${m.promo && m.promo.id === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
        <label class="fld"><span>Texto del destacado</span><input type="text" data-cf="promoS" value="${esc(m.promo ? m.promo.s : '')}" placeholder="Nuevo · S/ 59.90" maxlength="50"></label>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button type="button" class="btn ghost sm" data-act="c-up"${i === 0 ? ' disabled' : ''}>↑ Subir</button>
        <button type="button" class="btn ghost sm" data-act="c-down"${i === d.catOrder.length - 1 ? ' disabled' : ''}>↓ Bajar</button>
        <button type="button" class="btn danger sm" data-act="c-del">Eliminar categoría</button></div>
    </div></details>`;
  }).join('')}`;
  const open = renderCats.open; if (open != null) { const el = $(`details[data-ci="${open}"]`); if (el) el.open = true; }
}

/* Beneficios: cada categoría tiene su propia lista (d.catGoals[categoría]) */
view.addEventListener('keydown', e => { if (e.target.classList && e.target.classList.contains('g-new') && e.key === 'Enter') { e.preventDefault(); goalClick(e.target, 'g-add'); } });
function goalCtx(el) {
  const d = D(), card = el.closest('details[data-ci]'), ci = +card.dataset.ci, c = d.catOrder[ci];
  d.catGoals[c] = d.catGoals[c] || [];
  return { d, card, ci, c, list: d.catGoals[c] };
}
function goalClick(b, act) {
  const { d, card, ci, c, list } = goalCtx(b);
  renderCats.open = ci;
  if (act === 'g-add') {
    const inp = $('.g-new', card), n = inp.value.trim();
    if (!n) { inp.focus(); return; }
    if (list.some(g => g.toLowerCase() === n.toLowerCase())) { toast('Ese beneficio ya existe en esta categoría', true); return; }
    list.push(n); markDirty(); renderCats(); $(`details[data-ci="${ci}"] .g-new`).focus(); return;
  }
  const i = +b.closest('.row').dataset.gi, g = list[i];
  if (act === 'g-up' && i > 0) { moveIn(list, i, i - 1); markDirty(); renderCats(); }
  if (act === 'g-down' && i < list.length - 1) { moveIn(list, i, i + 1); markDirty(); renderCats(); }
  if (act === 'g-del') {
    const n = d.products.filter(p => p.cat === c && (p.goals || []).includes(g)).length;
    ask({ title: '¿Eliminar beneficio?', message: `Se quitará <b>${esc(g)}</b> del filtro de ${esc(c)}${n ? ` y de ${n} producto${n === 1 ? '' : 's'}` : ''}.`, confirmText: 'Eliminar', danger: true, icon: 'trash' }).then(ok => {
      if (!ok) return;
      list.splice(list.indexOf(g), 1);
      d.products.forEach(p => { if (p.cat === c && p.goals) p.goals = p.goals.filter(x => x !== g); });
      d.mega[c].cols.forEach(col => { if (col.kind === 'goal') col.l = col.l.filter(x => x !== g); });
      markDirty(); renderCats();
    });
  }
}
function goalRename(t) {
  const { d, ci, c, list } = goalCtx(t), i = +t.closest('.row').dataset.gi, old = list[i], n = t.value.trim();
  if (!n) { t.value = old; return; }
  if (n === old) return;
  if (list.some((g, k) => k !== i && g.toLowerCase() === n.toLowerCase())) { toast('Ya existe un beneficio con ese nombre', true); t.value = old; return; }
  list[i] = n;
  d.products.forEach(p => { if (p.cat === c && p.goals) p.goals = p.goals.map(x => (x === old ? n : x)); });
  d.mega[c].cols.forEach(col => { if (col.kind === 'goal') col.l = col.l.map(x => (x === old ? n : x)); });
  renderCats.open = ci; markDirty(); renderCats();
}
function catClick(b, act) {
  const d = D();
  if (act === 'c-new') {
    let n = 'Nueva categoría', k = 2; while (d.catOrder.includes(n)) n = 'Nueva categoría ' + k++;
    d.catOrder.push(n); d.catSub[n] = ''; d.catTone[n] = TONES[d.catOrder.length % TONES.length]; d.catShort[n] = '';
    d.mega[n] = { cols: [], promo: null };
    renderCats.open = d.catOrder.length - 1; markDirty(); renderCats();
    const card = $(`details[data-ci="${d.catOrder.length - 1}"] [data-cf=name]`); card.select(); return;
  }
  const card = b.closest('details'), i = +card.dataset.ci, c = d.catOrder[i];
  renderCats.open = i;
  if (act === 'c-tone') { d.catTone[c] = b.dataset.t; }
  if (act === 'c-coladd') d.mega[c].cols.push({ t: '', l: [] });
  if (act === 'c-colrm') d.mega[c].cols.splice(+b.dataset.k, 1);
  if (act === 'c-up' && i > 0) { moveIn(d.catOrder, i, i - 1); renderCats.open = i - 1; }
  if (act === 'c-down' && i < d.catOrder.length - 1) { moveIn(d.catOrder, i, i + 1); renderCats.open = i + 1; }
  if (act === 'c-del') {
    const n = d.products.filter(p => p.cat === c).length;
    if (n) {
      ask({ title: 'No se puede eliminar', message: `La categoría <b>${esc(c)}</b> tiene ${n} producto${n === 1 ? '' : 's'}. Muévelos a otra categoría o elimínalos primero.`, confirmText: 'Entendido', cancelText: null, icon: 'warn' });
      return;
    }
    ask({ title: '¿Eliminar categoría?', message: `Se eliminará <b>${esc(c)}</b> del menú y del inicio.`, confirmText: 'Eliminar', danger: true, icon: 'trash' }).then(ok => {
      if (!ok) return;
      d.catOrder.splice(d.catOrder.indexOf(c), 1); [d.catSub, d.catTone, d.catShort, d.mega, d.catFilter, d.catGoals].forEach(o => delete o[c]); renderCats.open = null;
      markDirty(); renderCats();
    });
    return;
  }
  markDirty(); renderCats();
}
view.addEventListener('input', e => {
  const t = e.target, f = t.dataset.cf, card = t.closest('details[data-ci]');
  if (!f || !card || f === 'name') return;
  const d = D(), c = d.catOrder[+card.dataset.ci];
  if (f === 'short') d.catShort[c] = t.value;
  if (f === 'sub') d.catSub[c] = t.value;
  if (f === 'tone') { d.catTone[c] = t.value; $('.sw', card).style.background = t.value; }
  if (f === 'colT') d.mega[c].cols[+t.closest('.col-box').dataset.k].t = t.value;
  if (f === 'colL') d.mega[c].cols[+t.closest('.col-box').dataset.k].l = t.value.split(',').map(s => s.trim()).filter(Boolean);
  if (f === 'promoS') { d.mega[c].promo = d.mega[c].promo || { s: '', id: null }; d.mega[c].promo.s = t.value; }
  if (f === 'fLabel' || f === 'fOpts') {
    const cur = d.catFilter[c] = d.catFilter[c] || { label: '', options: [] };
    if (f === 'fLabel') cur.label = t.value.trim(); else cur.options = t.value.split(',').map(x => x.trim()).filter(Boolean);
  }
  markDirty();
});
view.addEventListener('change', e => {
  const t = e.target, f = t.dataset.cf, card = t.closest('details[data-ci]');
  if (t.dataset.gf === 'name') return goalRename(t);
  if (!card) return;
  const d = D(), i = +card.dataset.ci, c = d.catOrder[i];
  if (f === 'colK') { const col = d.mega[c].cols[+t.closest('.col-box').dataset.k]; if (t.checked) col.kind = 'goal'; else delete col.kind; markDirty(); return; }
  if (f === 'promoId') {
    const id = +t.value; const m = d.mega[c];
    if (!id) m.promo = null; else {
      const p = pById(id);
      m.promo = { id, s: (m.promo && m.promo.s) || ((p.tag ? p.tag + ' · ' : '') + fmt(p.price)) };
    }
    markDirty(); renderCats.open = i; renderCats();
  }
  if (f === 'name') {
    const n = t.value.trim();
    if (!n) { t.value = c; return; }
    if (n === c) return;
    if (d.catOrder.includes(n)) { toast('Ya existe una categoría con ese nombre', true); t.value = c; return; }
    d.catOrder[i] = n;
    [d.catSub, d.catTone, d.catShort, d.mega, d.catFilter, d.catGoals].forEach(o => { if (o[c] !== undefined) o[n] = o[c]; delete o[c]; });
    d.products.forEach(p => { if (p.cat === c) p.cat = n; });
    if (filter.cat === c) filter.cat = n;
    markDirty(); renderCats.open = i; renderCats();
  }
});

/* =====================================================================
   PODCAST
   ===================================================================== */
const mmss = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
function parseDur(t) {
  t = String(t).trim(); if (!t) return 0;
  const m = t.match(/^(\d+):([0-5]?\d)$/); if (m) return +m[1] * 60 + +m[2];
  const n = parseFloat(t.replace(',', '.')); return Number.isNaN(n) ? NaN : Math.round(n * 60);
}
function renderPodcast() {
  const d = D();
  view.innerHTML = `
  <div class="sec-head"><div><h1>Podcast</h1>
    <p class="muted">El primer episodio de la lista es el «Último episodio». Arrastra ⋮⋮ o usa las flechas para reordenar.</p></div>
    <button class="btn" data-act="e-new">+ Nuevo episodio</button></div>
  <div class="card"><label class="fld"><span>Temas (filtros de la página del podcast)</span>
    <input type="text" id="topics" value="${esc(d.topics.filter(t => t !== 'Todos').join(', '))}" placeholder="Crianza, Lactancia, Salud, Belleza"><small>Separados por coma. «Todos» se agrega solo.</small></label></div>
  <div class="rows" id="e-rows">${d.episodes.length ? d.episodes.map((e, i) => `
    <div class="row" data-i="${i}">
      <button class="grip" aria-hidden="true" tabindex="-1" title="Arrastrar">⋮⋮</button>
      <div class="thumb" style="background:#c8fcc8">🎙</div>
      <div class="main"><div class="nm">${esc(e.t)}</div>
        <div class="sub">${esc(e.date || 'sin fecha')} · ${mmss(e.secs || 0)} · ${esc(e.topic || 'sin tema')}${e.audio ? ' · con audio' : ' · sin audio'}</div></div>
      <div class="acts">
        <button class="icon-btn" data-act="e-up" aria-label="Subir"${i === 0 ? ' disabled' : ''}>↑</button>
        <button class="icon-btn" data-act="e-down" aria-label="Bajar"${i === d.episodes.length - 1 ? ' disabled' : ''}>↓</button>
        <button class="icon-btn" data-act="e-edit" aria-label="Editar ${esc(e.t)}">✎</button>
        <button class="icon-btn" data-act="e-del" aria-label="Eliminar">🗑</button></div>
    </div>`).join('') : '<div class="empty">Aún no hay episodios.</div>'}</div>`;
  $('#topics').addEventListener('input', e => {
    const list = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
    D().topics = ['Todos', ...new Set(list.filter(s => s !== 'Todos'))]; markDirty();
  });
  sortable($('#e-rows'), (a, b) => { moveIn(D().episodes, a, b); markDirty(); renderPodcast(); });
}
function podClick(b, act) {
  const d = D();
  if (act === 'e-new') return episodeDialog(null);
  const i = +b.closest('.row').dataset.i, e = d.episodes[i];
  if (act === 'e-edit') episodeDialog(e);
  if (act === 'e-up' && i > 0) { moveIn(d.episodes, i, i - 1); markDirty(); renderPodcast(); }
  if (act === 'e-down' && i < d.episodes.length - 1) { moveIn(d.episodes, i, i + 1); markDirty(); renderPodcast(); }
  if (act === 'e-del') ask({ title: '¿Eliminar episodio?', message: `Se quitará <b>${esc(e.t)}</b> de la página del podcast.`, confirmText: 'Eliminar', danger: true, icon: 'trash' }).then(ok => { if (!ok) return; d.episodes.splice(d.episodes.indexOf(e), 1); markDirty(); renderPodcast(); });
}
function episodeDialog(e) {
  const isNew = !e, d = D();
  const draft = isNew ? { t: '', date: '', secs: 0, topic: (d.topics[1] || ''), prod: null, audio: '' } : clone(e);
  dlg.innerHTML = `<form method="dialog" id="ef" novalidate>
    <div class="dlg-head"><h2 id="dlg-title">${isNew ? 'Nuevo episodio' : 'Editar episodio'}</h2><button type="button" class="icon-btn" data-close aria-label="Cerrar">✕</button></div>
    <div class="dlg-body">
      <label class="fld"><span>Título *</span><input type="text" name="t" value="${esc(draft.t)}" placeholder="Ep. 25 · Título del episodio" maxlength="90" required></label>
      <div class="grid3">
        <label class="fld"><span>Fecha</span><input type="text" name="date" value="${esc(draft.date)}" placeholder="15 oct" maxlength="20"></label>
        <label class="fld"><span>Duración</span><input type="text" name="dur" value="${draft.secs ? mmss(draft.secs) : ''}" placeholder="32:10" inputmode="numeric"><small>mm:ss — se llena sola al subir el audio</small></label>
        <label class="fld"><span>Tema</span><select name="topic">${d.topics.filter(t => t !== 'Todos').map(t => `<option${t === draft.topic ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      </div>
      <label class="fld"><span>Producto mencionado</span><select name="prod"><option value="">Ninguno</option>
        ${d.products.map(p => `<option value="${p.id}"${p.id === draft.prod ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <div class="fld"><span>Audio (mp3, m4a, wav u ogg)</span><div class="audio-box" id="ab"></div></div>
      <div class="form-err" id="ef-err" role="alert"></div>
    </div>
    <div class="dlg-foot"><span></span><div class="r"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="submit" class="btn">${isNew ? 'Agregar episodio' : 'Aplicar'}</button></div></div>
  </form>`;
  const f = $('#ef'), ab = $('#ab');
  function drawAudio(busy) {
    ab.innerHTML = (draft.audio ? `<audio controls preload="metadata" src="${esc(src(draft.audio))}"></audio><button type="button" class="link red" data-a="rm">Quitar audio</button>` : '<span class="muted small">Sin audio: el reproductor simulará la reproducción.</span>') +
      `<label class="btn ghost sm">${busy ? 'Subiendo…' : draft.audio ? 'Reemplazar' : 'Subir audio'}<input type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg" hidden></label>`;
  }
  drawAudio();
  ab.addEventListener('click', ev => { if (ev.target.dataset.a === 'rm') { draft.audio = ''; drawAudio(); } });
  ab.addEventListener('change', async ev => {
    const file = ev.target.files && ev.target.files[0]; if (!file) return;
    drawAudio(true);
    try {
      draft.audio = await upload('audio', file);
      const a = new Audio(src(draft.audio));
      a.addEventListener('loadedmetadata', () => { if (isFinite(a.duration)) f.dur.value = mmss(Math.round(a.duration)); });
    } catch (err) { toast(err.message, true); }
    drawAudio();
  });
  f.addEventListener('submit', ev => {
    ev.preventDefault();
    const v = new FormData(f), t = v.get('t').trim(), secs = parseDur(v.get('dur'));
    if (!t) return ($('#ef-err').textContent = 'Escribe el título del episodio.');
    if (Number.isNaN(secs)) return ($('#ef-err').textContent = 'La duración debe verse así: 32:10');
    const out = { t, date: v.get('date').trim(), secs, topic: v.get('topic'), meta: '' };
    if (v.get('prod')) out.prod = +v.get('prod');
    if (draft.audio) out.audio = draft.audio;
    if (isNew) d.episodes.unshift(out); else d.episodes[d.episodes.indexOf(e)] = out;
    markDirty(); dlg.close(); renderPodcast();
    toast('Episodio ' + (isNew ? 'agregado' : 'actualizado') + '. Recuerda guardar los cambios.');
  });
  dlg.showModal(); f.t.focus();
}

/* =====================================================================
   AJUSTES
   ===================================================================== */
const SOCIALS = ['Instagram', 'TikTok', 'Facebook', 'Spotify', 'Apple', 'YouTube'];
function renderSettings() {
  const c = S.config, d = D();
  view.innerHTML = `
  <div class="sec-head"><div><h1>Ajustes</h1><p class="muted">Contacto, redes, envíos, cupones y textos de ayuda.</p></div></div>
  <div class="card"><h2>WhatsApp</h2><div class="grid2">
    <label class="fld"><span>Número (con código de país, sin + ni espacios)</span><input type="tel" data-bind="config.whatsapp" value="${esc(c.whatsapp)}" inputmode="numeric" placeholder="51940395933"></label>
    <label class="fld"><span>Mensaje inicial</span><input type="text" data-bind="config.whatsappMsg" value="${esc(c.whatsappMsg)}"></label></div></div>
  <div class="card"><h2>Redes y plataformas de podcast</h2><div class="grid2">
    ${SOCIALS.map(s => `<label class="fld"><span>${s}</span><input type="url" data-bind="config.social.${s}" value="${esc(c.social[s] || '')}" placeholder="https://…"></label>`).join('')}</div>
    <p class="muted small" style="margin:10px 0 0">Si dejas uno vacío, el botón mostrará «próximamente».</p></div>
  <div class="card"><h2>Envíos</h2>
    <label class="fld" style="max-width:300px;margin-bottom:14px"><span>Envío gratis en Lima desde (S/)</span><input type="number" min="0" step="1" data-bind="config.freeShippingFrom" data-num value="${c.freeShippingFrom}"></label>
    <div class="stack">${Object.entries(d.shipping).map(([k, s]) => `<div class="grid3">
      <label class="fld"><span>Nombre</span><input type="text" data-bind="data.shipping.${k}.l" value="${esc(s.l)}"></label>
      <label class="fld"><span>Plazo</span><input type="text" data-bind="data.shipping.${k}.s" value="${esc(s.s)}"></label>
      <label class="fld"><span>Costo (S/)</span><input type="number" min="0" step="0.5" data-bind="data.shipping.${k}.p" data-num value="${s.p}"></label></div>`).join('')}</div></div>
  <div class="card"><h2>Cupones</h2><div class="stack" id="coupons">${Object.entries(c.coupons).map(([code, pct]) => couponRow(code, pct)).join('')}</div>
    <div style="margin-top:12px"><button type="button" class="link" data-act="s-coupon">+ Agregar cupón</button></div></div>
  <div class="card"><h2>Páginas de ayuda</h2><div class="stack">${Object.entries(d.help).map(([k, h]) => `
    <div class="stack"><label class="fld"><span>Título</span><input type="text" data-bind="data.help.${k}.title" value="${esc(h.title)}"></label>
    <label class="fld"><span>Texto <small>(separa los párrafos con una línea en blanco)</small></span><textarea rows="5" data-bind="data.help.${k}.body" data-paras>${esc(h.body.join('\n\n'))}</textarea></label></div>`).join('')}</div></div>
  <div class="card"><h2>Seguridad</h2><p class="muted" style="margin-top:0">Cada guardado deja un respaldo en Vercel Blob (carpeta <code>backups/</code>, se conservan los últimos 30). La contraseña se cambia en Vercel → Settings → Environment Variables → <code>ADMIN_PASSWORD</code> (y se vuelve a desplegar).</p></div>`;
}
const couponRow = (code, pct) => `<div class="grid3" data-coupon><label class="fld"><span>Código</span><input type="text" data-cp="code" value="${esc(code)}" maxlength="24" style="text-transform:uppercase"></label>
  <label class="fld"><span>Descuento (%)</span><input type="number" min="1" max="90" step="1" data-cp="pct" value="${Math.round(pct * 100)}"></label>
  <div style="align-self:end"><button type="button" class="link red" data-act="s-cprm">Quitar</button></div></div>`;
function setClick(b, act) {
  if (act === 's-coupon') { $('#coupons').insertAdjacentHTML('beforeend', couponRow('', 0.1)); $('#coupons [data-coupon]:last-child input').focus(); }
  if (act === 's-cprm') { b.closest('[data-coupon]').remove(); readCoupons(); }
}
function readCoupons() {
  const out = {};
  $$('#coupons [data-coupon]').forEach(r => {
    const code = $('[data-cp=code]', r).value.trim().toUpperCase().replace(/\s+/g, ''), pct = parseFloat($('[data-cp=pct]', r).value);
    if (code && pct > 0 && pct <= 90) out[code] = Math.round(pct) / 100;
  });
  S.config.coupons = out; markDirty();
}
view.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.cp) return readCoupons();
  const path = t.dataset.bind; if (!path) return;
  const keys = path.split('.'), last = keys.pop();
  const obj = keys.reduce((o, k) => o[k], S);
  if (t.hasAttribute('data-paras')) obj[last] = t.value.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  else if (t.hasAttribute('data-num')) obj[last] = parseFloat(t.value) || 0;
  else obj[last] = t.type === 'tel' ? t.value.replace(/\D/g, '') : t.value;
  markDirty();
});

/* =====================================================================
   PORTADA (hero) Y CAMPAÑAS DE TEMPORADA
   ===================================================================== */
const DEFAULT_HERO = {
  eyebrow: 'Nueva colección', title: 'Todo para mamá y sus peques',
  text: 'Belleza, básicos para niños, ropa, gomitas saludables y un podcast para acompañarte en la crianza.',
  cta1: { label: 'Comprar ahora', link: '#/categoria/Belleza' }, cta2: { label: '▶ Escuchar podcast', link: '#/podcast' },
  img: 'img/hero.jpg', imgM: 'img/hero-m.jpg', alt: 'Una mamá sonríe a su hija mientras le acomoda el cabello en un cuarto luminoso', pos: '60% 30%', bg: ''
};
const HERO_BG = 'linear-gradient(115deg,#fcfcc8 0%,#f8dcc6 16%,#fbbad9 34%,#c8befa 55%,#c8fcf4 76%,#ccfcc8 100%)';
const POS = [['60% 30%', 'Predeterminado'], ['50% 50%', 'Centro'], ['50% 0%', 'Arriba'], ['50% 100%', 'Abajo'], ['0% 50%', 'Izquierda'], ['100% 50%', 'Derecha']];
const PRESETS = {
  'Navidad': { m1: 12, d1: 1, m2: 12, d2: 25, eyebrow: 'Navidad', title: 'Regala con amor esta Navidad', text: 'Detalles para mamá y sus peques, listos para regalar.', cta: ['Ver regalos', '#/ofertas'], bg: '#fcd9d9' },
  'Día de la Madre': { m1: 5, d1: 1, m2: 5, d2: 11, eyebrow: 'Día de la Madre', title: 'Para la mejor mamá', text: 'Consiéntela con belleza y cuidado. Envíos a todo el Perú.', cta: ['Comprar ahora', '#/categoria/Belleza'], bg: '#fbbad9' },
  'Día de la Mujer': { m1: 3, d1: 1, m2: 3, d2: 8, eyebrow: 'Día de la Mujer', title: 'Hoy celebramos a las mujeres', text: 'Un detalle especial con descuentos por su día.', cta: ['Ver ofertas', '#/ofertas'], bg: '#e8d5e6' },
  'Cyber Days': { m1: 10, d1: 26, m2: 10, d2: 31, eyebrow: 'Cyber Days', title: 'Cyber Days: ofertas por tiempo limitado', text: 'Descuentos en belleza, ropa infantil y más. Hasta agotar stock.', cta: ['Ver ofertas', '#/ofertas'], bg: '#dcd5fb' },
  'Black Friday': { m1: 11, d1: 24, m2: 11, d2: 30, eyebrow: 'Black Friday', title: 'Black Friday', text: 'Los mejores precios del año para mamá y sus peques.', cta: ['Ver ofertas', '#/ofertas'], bg: '#e4defd' },
  'Día del Niño': { m1: 4, d1: 1, m2: 4, d2: 14, eyebrow: 'Día del Niño', title: 'Celebra a tus peques', text: 'Sorpresas y básicos para que disfruten su día.', cta: ['Ver productos', '#/categoria/Bebé%20y%20niños'], bg: '#fcf3c0' },
  'Fiestas Patrias': { m1: 7, d1: 20, m2: 7, d2: 29, eyebrow: 'Fiestas Patrias', title: '¡Feliz 28 de julio!', text: 'Celebra con ofertas especiales por Fiestas Patrias.', cta: ['Ver ofertas', '#/ofertas'], bg: '#fcd9d9' },
  'Vuelta a clases': { m1: 2, d1: 15, m2: 3, d2: 31, eyebrow: 'Vuelta a clases', title: 'Listos para volver a clases', text: 'Todo lo que necesitan tus peques para empezar el año.', cta: ['Ver productos', '#/categoria/Ropa%20infantil'], bg: '#c8fcf4' }
};
const ymd = dt => dt.toLocaleDateString('en-CA');
function presetDates(t) {
  const now = new Date(), y = now.getFullYear(), today = new Date(y, now.getMonth(), now.getDate());
  const yy = new Date(y, t.m2 - 1, t.d2) < today ? y + 1 : y;
  return { start: ymd(new Date(yy, t.m1 - 1, t.d1)), end: ymd(new Date(yy, t.m2 - 1, t.d2)) };
}
function heroStatus(h) {
  const t = ymd(new Date());
  if (h.active === false) return ['Pausada', 'off'];
  if (h.start && h.start > t) return ['Programada', 'soon'];
  if (h.end && h.end < t) return ['Vencida', 'off'];
  return ['En vivo', 'live'];
}
const fmtDate = s => (s ? new Date(s + 'T00:00:00').toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const heroRange = h => (h.start || h.end ? `${h.start ? fmtDate(h.start) : 'Sin inicio'} → ${h.end ? fmtDate(h.end) : 'Sin fin'}` : 'Sin fechas (siempre)');

function heroPreview(h) {
  const btn = (b, g) => (b && b.label ? `<i class="${g ? 'g' : ''}">${esc(b.label)}</i>` : '');
  return `<div class="hp" style="background:${esc(h.bg || HERO_BG)}">
    <div class="hp-t">${h.eyebrow ? `<small>${esc(h.eyebrow)}</small>` : ''}<b>${esc(h.title || 'Título')}</b>${h.text ? `<span>${esc(h.text)}</span>` : ''}<div>${btn(h.cta1)}${btn(h.cta2, true)}</div></div>
    <div class="hp-i">${h.img ? `<img src="${esc(src(h.img))}" alt="" style="object-position:${esc(h.pos || '60% 30%')}">` : '<em>Sin imagen</em>'}</div></div>`;
}

function renderHero() {
  const d = D(), live = d.heroes.find(h => heroStatus(h)[1] === 'live'), shown = live || d.hero;
  view.innerHTML = `
  <div class="sec-head"><div><h1>Portada</h1>
    <p class="muted">La imagen y el mensaje principal del inicio. Crea campañas de temporada con fechas y se activan y desactivan solas.</p></div>
    <button class="btn" data-act="h-new">+ Nueva campaña</button></div>
  <div class="card"><h2>Ahora en la tienda</h2>${heroPreview(shown)}
    <p class="muted small" style="margin:10px 0 0">${live ? `Campaña «${esc(live.name)}»` : 'Portada por defecto (no hay campañas en vivo hoy)'}</p></div>
  <h2 class="h2">Campañas</h2>
  <p class="muted small" style="margin:-6px 0 12px">Si coinciden varias en fechas, se muestra la que esté más arriba. Arrastra ⋮⋮ o usa las flechas para cambiar la prioridad.</p>
  <div class="rows" id="h-rows">${d.heroes.length ? d.heroes.map((h, i) => { const [st, k] = heroStatus(h); return `
    <div class="row" data-i="${i}">
      <button class="grip" aria-hidden="true" tabindex="-1" title="Arrastrar">⋮⋮</button>
      <div class="thumb wide">${h.img ? `<img src="${esc(src(h.img))}" alt="" loading="lazy">` : 'sin imagen'}</div>
      <div class="main"><div class="nm">${esc(h.name)}<span class="st ${k}">${st}</span></div>
        <div class="sub">${esc(h.title)} · ${esc(heroRange(h))}</div></div>
      <div class="acts">
        <button class="icon-btn ${h.active === false ? '' : 'on'}" data-act="h-toggle" aria-pressed="${h.active !== false}" title="${h.active === false ? 'Activar' : 'Pausar'}" aria-label="${h.active === false ? 'Activar' : 'Pausar'}">${h.active === false ? '▶' : '❚❚'}</button>
        <button class="icon-btn" data-act="h-up" aria-label="Subir"${i === 0 ? ' disabled' : ''}>↑</button>
        <button class="icon-btn" data-act="h-down" aria-label="Bajar"${i === d.heroes.length - 1 ? ' disabled' : ''}>↓</button>
        <button class="icon-btn" data-act="h-edit" aria-label="Editar ${esc(h.name)}" title="Editar">✎</button>
        <button class="icon-btn" data-act="h-dup" aria-label="Duplicar" title="Duplicar">⧉</button>
        <button class="icon-btn" data-act="h-del" aria-label="Eliminar" title="Eliminar">🗑</button></div></div>`; }).join('') : '<div class="empty">Aún no hay campañas. Crea una desde una plantilla (Navidad, Día de la Madre, Cyber…).</div>'}</div>
  <h2 class="h2" style="margin-top:28px">Portada por defecto</h2>
  <div class="card">${heroPreview(d.hero)}<div style="margin-top:12px"><button class="btn ghost sm" data-act="h-default">Editar portada por defecto</button></div>
    <p class="muted small" style="margin:10px 0 0">Se muestra cuando no hay ninguna campaña en vivo.</p></div>`;
  sortable($('#h-rows'), (a, b) => { moveIn(D().heroes, a, b); markDirty(); renderHero(); });
}
function heroClick(b, act) {
  const d = D();
  if (act === 'h-new') return heroDialog(null);
  if (act === 'h-default') return heroDialog('default');
  const i = +b.closest('.row').dataset.i, h = d.heroes[i];
  if (act === 'h-edit') heroDialog(h);
  if (act === 'h-toggle') { h.active = h.active === false; markDirty(); renderHero(); }
  if (act === 'h-up' && i > 0) { moveIn(d.heroes, i, i - 1); markDirty(); renderHero(); }
  if (act === 'h-down' && i < d.heroes.length - 1) { moveIn(d.heroes, i, i + 1); markDirty(); renderHero(); }
  if (act === 'h-dup') ask({ title: 'Duplicar campaña', message: `Se creará una copia de <b>${esc(h.name)}</b>. Quedará <b>pausada</b> para que ajustes fechas y textos antes de activarla.`, confirmText: 'Duplicar', icon: 'copy', input: { label: 'Nombre de la copia', value: h.name + ' (copia)', max: 60 } }).then(name => { if (!name) return; const c = clone(h); c.name = name; c.active = false; d.heroes.splice(d.heroes.indexOf(h) + 1, 0, c); markDirty(); renderHero(); toast('Campaña duplicada (queda pausada)'); });
  if (act === 'h-del') ask({ title: '¿Eliminar campaña?', message: `Se eliminará <b>${esc(h.name)}</b>. Si estaba en vivo, la tienda volverá a la portada por defecto.`, confirmText: 'Eliminar', danger: true, icon: 'trash' }).then(ok => { if (!ok) return; d.heroes.splice(d.heroes.indexOf(h), 1); markDirty(); renderHero(); });
}

/* Lista de destinos para los botones */
function destOptions() {
  const d = D();
  return [['#/', 'Inicio'], ...d.catOrder.map(c => ['#/categoria/' + encodeURIComponent(c), 'Categoría: ' + c]), ['#/ofertas', 'Ofertas'], ['#/podcast', 'Podcast'],
    ...d.products.map(p => ['#/producto/' + p.id, 'Producto: ' + p.name])];
}
function destField(n, cur) {
  const opts = destOptions(), known = opts.some(o => o[0] === cur);
  return `<select name="${n}Sel" aria-label="Destino del botón">${opts.map(o => `<option value="${esc(o[0])}"${o[0] === cur ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}<option value="custom"${cur && !known ? ' selected' : ''}>Otro enlace…</option></select>
    <input type="text" name="${n}Custom" value="${cur && !known ? esc(cur) : ''}" placeholder="#/ofertas o https://…" aria-label="Enlace personalizado"${cur && !known ? '' : ' hidden'}>`;
}

function heroDialog(target) {
  const isDef = target === 'default', isNew = !target, d = D();
  const draft = isNew ? { name: '', active: true, start: '', end: '', eyebrow: '', title: '', text: '', cta1: { label: 'Ver ofertas', link: '#/ofertas' }, cta2: null, img: '', imgM: '', alt: '', pos: '60% 30%', bg: '' }
    : clone(isDef ? d.hero : target);
  dlg.innerHTML = `<form method="dialog" id="hf" novalidate>
    <div class="dlg-head"><h2 id="dlg-title">${isDef ? 'Portada por defecto' : isNew ? 'Nueva campaña' : 'Editar campaña'}</h2><button type="button" class="icon-btn" data-close aria-label="Cerrar">✕</button></div>
    <div class="dlg-body">
      <div id="hp-box"></div>
      ${isNew ? `<label class="fld"><span>Empezar desde una plantilla</span><select name="preset"><option value="">En blanco</option>${Object.keys(PRESETS).map(k => `<option>${esc(k)}</option>`).join('')}</select><small>Llena el texto, el color y las fechas sugeridas; puedes cambiarlos.</small></label>` : ''}
      ${isDef ? '' : `<label class="fld"><span>Nombre interno *</span><input type="text" name="name" value="${esc(draft.name)}" maxlength="60" placeholder="Navidad 2026"><small>Solo lo ves tú.</small></label>
      <div class="grid3">
        <label class="fld"><span>Desde</span><input type="date" name="start" value="${esc(draft.start)}"></label>
        <label class="fld"><span>Hasta (incluido)</span><input type="date" name="end" value="${esc(draft.end)}"></label>
        <label class="check" style="align-self:end;min-height:42px"><input type="checkbox" name="active"${draft.active !== false ? ' checked' : ''}> Activa</label></div>
      <p class="muted small" style="margin:-6px 0 0">Sin fechas = siempre en vivo. Con fechas, se activa y se apaga sola (según la fecha del navegador del visitante).</p>`}
      <div class="fld"><span>Imagen *</span>
        <div class="audio-box"><div class="hero-up" id="hu"></div></div>
        <small>Mejor horizontal, de 1600×900 px o más. Se crea sola la versión liviana para celular.</small></div>
      <div class="grid2">
        <label class="fld"><span>Enfoque de la imagen</span><select name="pos">${POS.map(p => `<option value="${p[0]}"${p[0] === draft.pos ? ' selected' : ''}>${p[1]}</option>`).join('')}</select><small>Qué parte se conserva al recortar.</small></label>
        <label class="fld"><span>Descripción de la imagen (accesibilidad)</span><input type="text" name="alt" value="${esc(draft.alt)}" maxlength="140"></label></div>
      <div class="grid2">
        <label class="fld"><span>Etiqueta superior</span><input type="text" name="eyebrow" value="${esc(draft.eyebrow)}" maxlength="40" placeholder="Navidad"></label>
        <label class="fld"><span>Título *</span><input type="text" name="title" value="${esc(draft.title)}" maxlength="70"></label></div>
      <label class="fld"><span>Texto</span><textarea name="text" rows="2" maxlength="200">${esc(draft.text)}</textarea></label>
      <div class="grid2">
        <div class="stack"><label class="fld"><span>Botón principal: texto</span><input type="text" name="cta1Label" value="${esc(draft.cta1 ? draft.cta1.label : '')}" maxlength="30"></label>
          <div class="fld"><span>Botón principal: destino</span>${destField('cta1', draft.cta1 ? draft.cta1.link : '#/')}</div></div>
        <div class="stack"><label class="fld"><span>Botón secundario: texto (opcional)</span><input type="text" name="cta2Label" value="${esc(draft.cta2 ? draft.cta2.label : '')}" maxlength="30"></label>
          <div class="fld"><span>Botón secundario: destino</span>${destField('cta2', draft.cta2 ? draft.cta2.link : '#/podcast')}</div></div></div>
      <div class="fld"><span>Color de fondo del texto</span>
        <div class="swatches" id="bg-sw"><button type="button" class="orig" data-bg="" aria-label="Degradado original" aria-pressed="${!draft.bg}" style="background:${HERO_BG}"></button>
          ${TONES.map(t => `<button type="button" style="background:${t}" data-bg="${t}" aria-label="Color ${t}" aria-pressed="${t === draft.bg}"></button>`).join('')}
          <input type="color" id="bg-c" value="${/^#[0-9a-f]{6}$/i.test(draft.bg) ? draft.bg : '#fbbad9'}" aria-label="Otro color"></div>
        <input type="hidden" name="bg" value="${esc(draft.bg)}"></div>
      <div class="form-err" id="hf-err" role="alert"></div>
    </div>
    <div class="dlg-foot"><span></span><div class="r"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="submit" class="btn">${isNew ? 'Crear campaña' : 'Aplicar'}</button></div></div>
  </form>`;
  const f = $('#hf'), el = n => f.elements[n];
  const dest = n => (el(n + 'Sel').value === 'custom' ? el(n + 'Custom').value.trim() : el(n + 'Sel').value);
  const read = () => ({
    eyebrow: el('eyebrow').value.trim(), title: el('title').value.trim(), text: el('text').value.trim(),
    cta1: el('cta1Label').value.trim() ? { label: el('cta1Label').value.trim(), link: dest('cta1') } : null,
    cta2: el('cta2Label').value.trim() ? { label: el('cta2Label').value.trim(), link: dest('cta2') } : null,
    img: draft.img, pos: el('pos').value, bg: el('bg').value
  });
  const preview = () => { $('#hp-box').innerHTML = heroPreview(read()); };
  const drawUp = busy => {
    $('#hu').innerHTML = `${draft.img ? `<img class="hu-img" src="${esc(src(draft.img))}" alt="Imagen actual">` : '<span class="muted small">Todavía no hay imagen.</span>'}
      <label class="btn ghost sm">${busy ? 'Subiendo…' : draft.img ? 'Reemplazar imagen' : 'Subir imagen'}<input type="file" accept="image/*" hidden></label>`;
  };
  drawUp(); preview();
  ['cta1', 'cta2'].forEach(n => el(n + 'Sel').addEventListener('change', () => { el(n + 'Custom').hidden = el(n + 'Sel').value !== 'custom'; preview(); }));
  f.addEventListener('input', preview); f.addEventListener('change', preview);
  const setBg = v => { el('bg').value = v; $$('#bg-sw button').forEach(b => b.setAttribute('aria-pressed', b.dataset.bg === v)); preview(); };
  $('#bg-sw').addEventListener('click', e => { const b = e.target.closest('[data-bg]'); if (b) setBg(b.dataset.bg); });
  $('#bg-c').addEventListener('input', e => setBg(e.target.value));
  if (isNew) el('preset').addEventListener('change', () => {
    const t = PRESETS[el('preset').value]; if (!t) return;
    const dt = presetDates(t);
    el('name').value = el('preset').value + ' ' + dt.start.slice(0, 4); el('start').value = dt.start; el('end').value = dt.end;
    el('eyebrow').value = t.eyebrow; el('title').value = t.title; el('text').value = t.text; el('cta1Label').value = t.cta[0];
    const sel = el('cta1Sel'), hit = [...sel.options].some(o => o.value === t.cta[1]);
    sel.value = hit ? t.cta[1] : 'custom'; el('cta1Custom').hidden = hit; el('cta1Custom').value = hit ? '' : t.cta[1];
    setBg(t.bg);
  });
  $('#hu').addEventListener('change', async ev => {
    const file = ev.target.files && ev.target.files[0]; if (!file) return;
    if (!file.type.startsWith('image/')) return toast('Ese archivo no es una imagen', true);
    drawUp(true);
    try {
      const v = await heroVariants(file);
      draft.img = await upload('hero', v.big); draft.imgM = v.small ? await upload('hero', v.small) : '';
      if (v.w < 1000) toast('La imagen es pequeña (' + v.w + ' px); puede verse borrosa en pantallas grandes.', true);
    } catch (err) { toast(err.message, true); }
    drawUp(); preview();
  });
  f.addEventListener('submit', ev => {
    ev.preventDefault();
    const err = m => { $('#hf-err').textContent = m; };
    const r = read(), okLink = l => /^(#|\/|https?:\/\/)/.test(l);
    if (!isDef && !el('name').value.trim()) return err('Ponle un nombre interno a la campaña.');
    if (!r.title) return err('Escribe el título.');
    if (!draft.img) return err('Sube una imagen.');
    if (r.cta1 && !okLink(r.cta1.link)) return err('El enlace del botón principal debe empezar con #/, / o https://');
    if (r.cta2 && !okLink(r.cta2.link)) return err('El enlace del botón secundario debe empezar con #/, / o https://');
    if (!isDef && el('start').value && el('end').value && el('end').value < el('start').value) return err('La fecha «Hasta» no puede ser anterior a «Desde».');
    const out = { ...r, imgM: draft.imgM, alt: el('alt').value.trim() || r.title };
    if (isDef) d.hero = out;
    else {
      Object.assign(out, { name: el('name').value.trim(), active: el('active').checked, start: el('start').value, end: el('end').value });
      if (isNew) d.heroes.unshift(out); else d.heroes[d.heroes.indexOf(target)] = out;
    }
    markDirty(); dlg.close(); renderHero();
    toast('Portada actualizada. Recuerda guardar los cambios.');
  });
  dlg.showModal(); (isDef ? el('title') : el(isNew ? 'preset' : 'name')).focus();
}
/* Crea la versión grande (1600 px) y la liviana (800 px) de la imagen, en JPEG */
async function heroVariants(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const base = file.name.replace(/\.[^.]+$/, '');
  const make = async (w, suffix) => {
    const k = Math.min(1, w / bmp.width), c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
    return new File([blob], base + suffix + '.jpg', { type: 'image/jpeg' });
  };
  return { big: await make(1600, ''), small: bmp.width > 900 ? await make(800, '-m') : null, w: bmp.width };
}

/* ---------- arranque ---------- */
boot().catch(err => { bootOff(); document.body.insertAdjacentHTML('afterbegin', `<p style="padding:20px">No se pudo conectar con el panel (${esc(err.message)}). Revisa que la web esté desplegada en Vercel (o corriendo con <code>vercel dev</code>).</p>`); });
})();
