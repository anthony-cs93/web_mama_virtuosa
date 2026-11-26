import { readStore, requireAdmin } from './_lib.js';
import { Fail, STATUSES, buildOrder, findOrder, listSummaries, notifyLater, pushStatus, saveOrder, setStatus, updateIndexLater } from './_orders.js';

/* Pedidos para el panel (requiere sesión)
   GET   resumen de los pedidos (índice), los más recientes primero; con ?code= el pedido completo
   POST  { code, status, note? } cambia el estado y lo deja en el historial
   POST  ?op=create { …datos del pedido, status? } crea un pedido a mano (los precios, el envío y los descuentos los calcula el servidor) */
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
      if (req.query.op === 'create') {
        const { store } = await readStore({ fresh: true });
        const o = buildOrder(store, { ...b, website: '' });
        const status = String(b.status || 'pending');
        if (!STATUSES.includes(status)) throw new Fail('Estado no válido');
        o.history[0].note = 'Pedido creado desde el panel';
        o.source = 'admin';
        if (status !== 'pending') pushStatus(o, status, 'Estado inicial al crear el pedido');
        const day = String(b.createdAt || '');
        if (day) {   // solo fecha (AAAA-MM-DD): ventas anteriores; hoy conserva la hora actual, otro día queda al mediodía de Lima
          const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
          const t = new Date(day + 'T12:00:00-05:00');
          if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || isNaN(t) || day > today) throw new Fail('La fecha del pedido no es válida');
          o.createdAt = day === today ? o.createdAt : t.toISOString();
          o.history.forEach(h => { h.at = o.createdAt; });
          if (o.cancelledAt) o.cancelledAt = o.createdAt;
        }
        await saveOrder(o);
        updateIndexLater(o);
        return res.status(200).json({ order: o });
      }
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
