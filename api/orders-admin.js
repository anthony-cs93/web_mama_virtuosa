import { requireAdmin } from './_lib.js';
import { Fail, findOrder, listSummaries, notifyLater, setStatus } from './_orders.js';

/* Pedidos para el panel (requiere sesión)
   GET   resumen de los pedidos (índice), los más recientes primero; con ?code= el pedido completo
   POST  { code, status, note? } cambia el estado y lo deja en el historial */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      if (req.query.codes) {   // hasta 15 pedidos completos en una sola llamada (se leen en paralelo)
        const codes = [...new Set(String(req.query.codes).split(',').map(x => x.trim()).filter(Boolean))].slice(0, 15);
        const found = await Promise.all(codes.map(c => findOrder(c).catch(() => null)));
        return res.status(200).json({ orders: found.filter(Boolean) });
      }
      if (req.query.code) {
        const o = await findOrder(String(req.query.code));
        if (!o) throw new Fail('Pedido no encontrado', 404);
        return res.status(200).json({ order: o });
      }
      return res.status(200).json({ orders: await listSummaries() });
    }
    if (req.method === 'POST') {
      if (!requireAdmin(req, res, { write: true })) return;
      const b = req.body || {};
      const o = await setStatus(String(b.code || ''), String(b.status || ''), String(b.note || '').slice(0, 200));
      if (b.status === 'paid') notifyLater('Pago confirmado', o);
      return res.status(200).json({ order: o });
    }
    throw new Fail('Método no permitido', 405);
  } catch (e) {
    if (e instanceof Fail) return res.status(e.status).json({ error: e.message });
    res.status(500).json({ error: 'No se pudo completar: ' + e.message });
  }
}
