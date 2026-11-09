import { purgeExpiredOrders, listSummaries, CANCEL_KEEP_DAYS } from './_orders.js';

/* Tarea diaria de Vercel (ver «crons» en vercel.json): elimina los pedidos cancelados con más de 30 días.
   Si defines la variable CRON_SECRET, Vercel la envía y aquí se exige; sin ella igual es inofensiva (solo borra lo vencido). */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'No autorizado' });
  try {
    await listSummaries();   // arma el índice si aún no existe (también limpia lo vencido)
    const r = await purgeExpiredOrders();
    res.status(200).json({ ok: true, keepDays: CANCEL_KEEP_DAYS, removed: r.removed });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo completar: ' + e.message });
  }
}
