import { readStore } from './_lib.js';

/* Datos públicos de la tienda como script: window.MV_CONFIG y window.MV_DATA. */
export default async function handler(req, res) {
  try {
    const { store } = await readStore();
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=300');
    res.status(200).send(`window.MV_CONFIG=${JSON.stringify(store.config)};\nwindow.MV_DATA=${JSON.stringify(store.data)};\n`);
  } catch (e) {
    res.status(500).setHeader('Content-Type', 'text/javascript').send('console.error("No se pudo cargar el catálogo");');
  }
}
