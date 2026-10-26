import { passwordOk, sessionCookie } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST' || req.headers['x-requested-with'] !== 'mv-admin') return res.status(403).json({ error: 'Solicitud no permitida' });
  if (!process.env.ADMIN_PASSWORD) return res.status(500).json({ error: 'Falta configurar ADMIN_PASSWORD en Vercel' });
  const pw = String((req.body && req.body.password) || '');
  if (!passwordOk(pw)) {
    await new Promise(r => setTimeout(r, 800));
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }
  res.setHeader('Set-Cookie', sessionCookie(req));
  res.status(200).json({ ok: true });
}
