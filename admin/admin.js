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
  if (dirty && !confirm('Tienes cambios sin guardar. ¿Salir de todos modos?')) return;
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
  ({ productos: renderProducts, categorias: renderCats, podcast: renderPodcast, ajustes: renderSettings })[tab]();
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
    const b = await blobUpload((kind === 'image' ? 'img/products/' : 'audio/') + stem + ext, file, { access: 'public', handleUploadUrl: '/api/upload' });
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
      const c = clone(p); c.id = nextId(); c.name += ' (copia)';
      D().products.splice(D().products.indexOf(p) + 1, 0, c); markDirty(); renderProducts(); toast('Producto duplicado');
    }
    if (act === 'p-del' && confirm(`¿Eliminar «${p.name}»? Dejará de mostrarse en la tienda.`)) {
      D().products = D().products.filter(x => x !== p); flagged.delete(p.id);
      Object.values(D().mega).forEach(m => { if (m.promo && m.promo.id === p.id) m.promo = null; });
      D().episodes.forEach(ep => { if (ep.prod === p.id) delete ep.prod; });
      markDirty(); renderProducts();
    }
    return;
  }
  if (act.startsWith('c-')) return catClick(b, act);
  if (act.startsWith('e-')) return podClick(b, act);
  if (act.startsWith('s-')) return setClick(b, act);
});

function subOptions(cat) {
  const set = new Set();
  const m = D().mega[cat]; if (m) m.cols.forEach(c => c.l.forEach(l => set.add(l)));
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
        <label class="fld"><span>Categoría *</span><select name="cat">${d.catOrder.map(c => `<option${c === draft.cat ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <label class="fld"><span>Subcategoría</span><input type="text" name="sub" list="subs" value="${esc(draft.sub)}" maxlength="40"><datalist id="subs"></datalist></label>
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
  const f = $('#pf'), fill = () => {
    $('#subs').innerHTML = subOptions(f.cat.value).map(s => `<option>${esc(s)}</option>`).join('');
  };
  fill(); f.cat.addEventListener('change', fill);

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
      id: isNew ? nextId() : p.id, name, cat: v.get('cat'), sub: v.get('sub').trim(),
      price: Math.round(price * 100) / 100, old: Math.round(old * 100) / 100, tag: v.get('tag').trim(), tone: v.get('tone'),
      stock: Number.isNaN(stock) ? 0 : Math.max(0, stock), ages: v.getAll('ages'),
      desc: v.get('desc').trim(), care: v.get('care').trim(), imgs: draft.imgs
    };
    if (optValues.length) out.opt = { label: optLabel, values: optValues };
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
    <p class="muted">Aparecen en el menú, en el inicio y como filtro. El orden de aquí es el de la tienda.</p></div>
    <button class="btn" data-act="c-new">+ Nueva categoría</button></div>
  ${d.catOrder.map((c, i) => {
    const m = d.mega[c], n = d.products.filter(p => p.cat === c).length;
    return `<details class="card" data-ci="${i}">
    <summary><span class="sw" style="background:${esc(d.catTone[c])}"></span><b>${esc(c)}</b><span class="muted small">${n} producto${n === 1 ? '' : 's'}</span></summary>
    <div class="stack">
      <div class="grid3">
        <label class="fld"><span>Nombre</span><input type="text" data-cf="name" value="${esc(c)}" maxlength="40"></label>
        <label class="fld"><span>Nombre corto</span><input type="text" data-cf="short" value="${esc(d.catShort[c] || '')}" maxlength="20"><small>Para espacios pequeños</small></label>
        <label class="fld"><span>Texto bajo el nombre</span><input type="text" data-cf="sub" value="${esc(d.catSub[c] || '')}" maxlength="60"></label>
      </div>
      <div class="fld"><span>Color de la tarjeta</span><div class="swatches">${TONES.map(t => `<button type="button" style="background:${t}" data-act="c-tone" data-t="${t}" aria-label="Color ${t}" aria-pressed="${t === d.catTone[c]}"></button>`).join('')}
        <input type="color" data-cf="tone" value="${/^#[0-9a-f]{6}$/i.test(d.catTone[c]) ? d.catTone[c] : '#fdd9ea'}" aria-label="Otro color"></div></div>
      <div class="fld"><span>Columnas del menú desplegable</span>
        <div class="cols-ed">${m.cols.map((col, k) => `<div class="col-box" data-k="${k}">
          <input type="text" data-cf="colT" value="${esc(col.t)}" placeholder="Título (ej. Cabello)" aria-label="Título de la columna">
          <input type="text" data-cf="colL" value="${esc(col.l.join(', '))}" placeholder="Brochas, Peines, Lazos" aria-label="Subcategorías, separadas por coma">
          <button type="button" class="link red" data-act="c-colrm" data-k="${k}">Quitar columna</button></div>`).join('')}</div>
        ${m.cols.length < 4 ? '<div><button type="button" class="link" data-act="c-coladd">+ Agregar columna</button></div>' : ''}
        <small>Las subcategorías de las columnas son los enlaces del menú. Un producto aparece ahí si su subcategoría tiene el mismo nombre.</small></div>
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
    if (n) { toast(`No se puede eliminar: tiene ${n} producto${n === 1 ? '' : 's'}. Muévelos o elimínalos primero.`, true); return; }
    if (!confirm(`¿Eliminar la categoría «${c}»?`)) return;
    d.catOrder.splice(i, 1); [d.catSub, d.catTone, d.catShort, d.mega].forEach(o => delete o[c]); renderCats.open = null;
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
  markDirty();
});
view.addEventListener('change', e => {
  const t = e.target, f = t.dataset.cf, card = t.closest('details[data-ci]');
  if (!card) return;
  const d = D(), i = +card.dataset.ci, c = d.catOrder[i];
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
    [d.catSub, d.catTone, d.catShort, d.mega].forEach(o => { o[n] = o[c]; delete o[c]; });
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
  if (act === 'e-del' && confirm(`¿Eliminar «${e.t}»?`)) { d.episodes.splice(i, 1); markDirty(); renderPodcast(); }
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

/* ---------- arranque ---------- */
boot().catch(err => { bootOff(); document.body.insertAdjacentHTML('afterbegin', `<p style="padding:20px">No se pudo conectar con el panel (${esc(err.message)}). Revisa que la web esté desplegada en Vercel (o corriendo con <code>vercel dev</code>).</p>`); });
})();
