import { readStore } from './_lib.js';

/* Datos públicos de la tienda como script: window.MV_CONFIG y window.MV_DATA. */
export default async function handler(req, res) {
  try {
    const { store } = await readStore();
    const { coupons, ...config } = store.config; // los cupones no son públicos: se validan en el servidor
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    // El navegador siempre revisa; solo el CDN de Vercel guarda la copia unos segundos
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.setHeader('Vercel-CDN-Cache-Control', 'max-age=30, stale-while-revalidate=120');
    res.status(200).send(`window.MV_CONFIG=${JSON.stringify(config)};\nwindow.MV_DATA=${JSON.stringify(store.data)};\n`);
  } catch (e) {
    res.status(500).setHeader('Content-Type', 'text/javascript').send('console.error("No se pudo cargar el catálogo");');
  }
}
