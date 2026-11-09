import { readStore } from './_lib.js';
import { Fail, buildOrder, evaluateCoupon, notifyOwner, publicOrder, pushStatus, readOrder, saveOrder, saveProof } from './_orders.js';

/* API pública de pedidos
   POST                 crea el pedido
   POST ?op=coupon      valida un cupón
   POST ?op=proof       sube el comprobante de Yape / transferencia
   GET  ?c=CÓDIGO&t=TOKEN  estado del pedido */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const o = await readOrder(String(req.query.c || ''), String(req.query.t || ''));
      if (!o) throw new Fail('No encontramos este pedido', 404);
      return res.status(200).json({ order: publicOrder(o) });
    }
    if (req.method !== 'POST') throw new Fail('Método no permitido', 405);
    if (req.headers['x-requested-with'] !== 'mv-shop') throw new Fail('Solicitud no permitida', 403);
    const b = req.body || {};
    const op = String(req.query.op || '');

    if (op === 'coupon') {
      const { store } = await readStore();
      const sub = Math.max(0, Number(b.subtotal) || 0);
      try { return res.status(200).json({ coupon: evaluateCoupon(store.config, b.code, sub) }); }
      catch (e) { await new Promise(r => setTimeout(r, 500)); throw e; } // pausa corta para frenar la búsqueda de códigos
    }

    if (op === 'proof') {
      const o = await readOrder(String(b.c || ''), String(b.t || ''));
      if (!o) throw new Fail('No encontramos este pedido', 404);
      if (!['yape', 'bank'].includes(o.pay.method) || !['pending', 'review'].includes(o.status)) throw new Fail('Este pedido ya no admite comprobante');
      const url = await saveProof(o, b.img);
      o.proof = { url, at: new Date().toISOString() };
      pushStatus(o, 'review', 'El cliente subió su comprobante');
      await saveOrder(o);
      await notifyOwner('Comprobante recibido', o);
      return res.status(200).json({ order: publicOrder(o) });
    }

    if (op) throw new Fail('Operación no válida');
    const { store } = await readStore();
    const o = buildOrder(store, b);
    await saveOrder(o);
    await notifyOwner('Nuevo pedido', o);
    return res.status(200).json({ code: o.code, token: o.token });
  } catch (e) {
    if (e instanceof Fail) return res.status(e.status).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: 'No pudimos procesar tu pedido. Intenta de nuevo en un momento.' });
  }
}
