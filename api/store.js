import { readStore, writeStore, requireAdmin, validate } from './_lib.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return res.status(200).json((await readStore()).store);
    }
    if (req.method === 'PUT') {
      if (!requireAdmin(req, res, { write: true })) return;
      if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(500).json({ error: 'Falta conectar Vercel Blob al proyecto' });
      const err = validate(req.body);
      if (err) return res.status(400).json({ error: err });
      await writeStore(req.body);
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'Método no permitido' });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo completar: ' + e.message });
  }
}
