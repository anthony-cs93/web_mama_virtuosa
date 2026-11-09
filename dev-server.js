/* Servidor local (npm run dev): sirve la tienda y ejecuta las funciones de api/ sin Vercel.
   Sin Vercel Blob todo se guarda en .data/ (el panel avisa que es modo de prueba). Clave del panel: la de ADMIN_PASSWORD o «dev». */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

process.env.ADMIN_PASSWORD ||= 'dev';
const PORT = Number(process.env.PORT) || 5173;
const ROOT = process.cwd();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

async function body(req) {
  const chunks = []; for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) {
      const name = url.pathname.slice(5).replace(/\.js$/, '').replace(/[^a-z0-9-]/gi, '');
      if (name.startsWith('_')) { res.statusCode = 404; return res.end(); }
      const mod = await import(pathToFileURL(join(ROOT, 'api', name + '.js')).href).catch(() => null);
      if (!mod) { res.statusCode = 404; return res.end('{"error":"No existe"}'); }
      req.query = Object.fromEntries(url.searchParams);
      req.body = req.method === 'GET' ? {} : await body(req);
      res.status = c => { res.statusCode = c; return res; };
      res.json = o => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
      res.send = s => { res.end(s); return res; };
      return await mod.default(req, res);
    }
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (!p || p.endsWith('/') || p.endsWith('\\')) p += 'index.html';
    if (p.includes('..') || /^(node_modules|api|\.git)([/\\]|$)/.test(p)) { res.statusCode = 404; return res.end(); }
    const file = join(ROOT, p);
    res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch (e) {
    if (!res.headersSent) { res.statusCode = e.code === 'ENOENT' ? 404 : 500; res.end(e.code === 'ENOENT' ? 'No encontrado' : String(e.message)); }
  }
}).listen(PORT, () => console.log(`Tienda: http://localhost:${PORT}   Panel: http://localhost:${PORT}/admin/  (clave: ${process.env.ADMIN_PASSWORD})`));
