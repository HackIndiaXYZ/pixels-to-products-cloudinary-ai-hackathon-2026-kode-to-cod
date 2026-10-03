import { resolve, logAccess, limited, clientIp, reasonText } from '../../../lib/engine';
import { imageUrl } from '../../../lib/media';
import { signedUrl } from '../../../lib/cloudinary';

// The reveal link. Same URL, different signed target before and after the reveal time.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (limited(clientIp(req))) return res.status(429).send('Too many requests');
  const { id, rt, dl } = req.query;
  try {
    const d = await resolve(id, rt);
    if (d.status !== 200) {
      await logAccess(id, d.campaignId, rt, `denied:${d.reason}`);
      return res.status(d.status).send(reasonText(d.reason));
    }
    const { asset, rec, live } = d;
    if (dl === '1') {
      if (!(rec && rec.can_download && live)) return res.status(403).send('Download is not allowed.');
      await logAccess(id, asset.campaignId, rt, 'download');
      return res.redirect(302, signedUrl(asset.public_id, asset.kind, [], { flags: 'attachment' }));
    }
    await logAccess(id, asset.campaignId, rt, live ? 'clear' : 'covered');
    return res.redirect(302, imageUrl(asset, live, rec));
  } catch (e) {
    return res.status(500).send('Reveal error');
  }
}
