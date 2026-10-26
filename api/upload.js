import { handleUpload } from '@vercel/blob/client';
import { isAuthed } from './_lib.js';

/* El navegador sube las fotos y el audio directo a Vercel Blob (sin pasar por la función, que limita a 4.5 MB). */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  try {
    const json = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async pathname => {
        if (!isAuthed(req)) throw new Error('Inicia sesión');
        const isImg = pathname.startsWith('img/products/'), isAudio = pathname.startsWith('audio/');
        if (!isImg && !isAudio) throw new Error('Ruta no permitida');
        return {
          allowedContentTypes: isImg ? ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] : ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/ogg'],
          maximumSizeInBytes: isImg ? 12 * 1024 * 1024 : 300 * 1024 * 1024,
          addRandomSuffix: true
        };
      },
      onUploadCompleted: async () => {}
    });
    res.status(200).json(json);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}
