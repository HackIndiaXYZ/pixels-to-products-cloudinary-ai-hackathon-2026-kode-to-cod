import { resolve, limited, clientIp, logAccess } from '../../../lib/engine';
import { fanUrl } from '../../../lib/media';

// Fan campaign: a personalised ticket-style poster. Only available after the reveal.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (limited(clientIp(req), 30)) return res.status(429).send('Too many requests');
  const d = await resolve(req.query.id, undefined);
  if (d.status !== 200 || !d.live || d.asset.kind !== 'image') return res.status(403).send('Not available yet');
  const name = String(req.query.name || '').replace(/[^\p{L}\p{N} .'-]/gu, '').slice(0, 30).trim();
  if (!name) return res.status(400).send('Add ?name=Your Name');
  const show = String(req.query.show || '').replace(/[^\p{L}\p{N} :.,'-]/gu, '').slice(0, 50).trim();
  await logAccess(d.asset.id, d.asset.campaignId, null, 'fan_poster');
  res.redirect(302, fanUrl(d.asset, name, show));
}
