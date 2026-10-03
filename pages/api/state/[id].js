import { resolve, reasonText } from '../../../lib/engine';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const d = await resolve(req.query.id, req.query.rt);
    if (d.status === 404) return res.status(404).json({ allowed: false, reason: 'unknown', message: reasonText('unknown') });
    if (d.status !== 200) return res.json({ allowed: false, reason: d.reason, message: reasonText(d.reason) });
    res.json({
      allowed: true, live: d.live, reveal_at: d.reveal_at, now: Date.now(),
      title: d.asset.name, kind: d.asset.kind, can_download: !!(d.rec && d.rec.can_download),
    });
  } catch (e) {
    res.status(500).json({ allowed: false, reason: 'error', message: 'Something went wrong.' });
  }
}
