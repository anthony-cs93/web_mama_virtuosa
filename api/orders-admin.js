import { requireAdmin } from './_lib.js';
import { Fail, listOrders, notifyLater, setStatus } from './_orders.js';

/* Pedidos para el panel (requiere sesión)
   GET   lista de pedidos, los más recientes primero
   POST  { code, status, note? } cambia el estado y lo deja en el historial */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return res.status(200).json({ orders: await listOrders() });
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
