import { load, mutate, audit } from './db';

const REASONS = {
  not_approved: 'This asset has not been approved for release yet.',
  token_required: 'This link needs a personal recipient token.',
  bad_token: 'This recipient link is not valid.',
  expired: 'This link has expired.',
  territory: 'This asset is not available in your territory.',
  unknown: 'Unknown reveal.',
};
export const reasonText = (r) => REASONS[r] || 'Unavailable.';
const deny = (status, reason, asset) => ({ status, reason, campaignId: asset ? asset.campaignId : null });

// Decides what a request may see. Everything is computed from the clock at request time, so no scheduler can miss a reveal.
export async function resolve(assetId, token) {
  const db = await load();
  const asset = db.assets[assetId];
  if (!asset) return deny(404, 'unknown');
  if (!asset.approved) return deny(403, 'not_approved', asset);
  let rec = null;
  if (token) {
    rec = db.recipients[token];
    if (!rec || rec.campaignId !== asset.campaignId) return deny(403, 'bad_token', asset);
    if (rec.expires_at && Date.now() > Date.parse(rec.expires_at)) return deny(410, 'expired', asset);
    if (asset.territories.length && rec.territory && !asset.territories.includes(rec.territory)) return deny(403, 'territory', asset);
  } else if (!asset.open_link) return deny(401, 'token_required', asset);
  const reveal_at = (rec && rec.reveal_at) || asset.reveal_at;
  return { status: 200, asset, rec, reveal_at, live: Date.now() >= Date.parse(reveal_at) };
}

export function logAccess(assetId, campaignId, token, outcome) {
  return mutate((db) => audit(db, { type: 'access', assetId, campaignId, recipient: token || null, outcome }))
    .catch(() => {});
}

const hits = new Map();
export function limited(ip, max = 240) {
  const k = `${ip}:${Math.floor(Date.now() / 60000)}`;
  const n = (hits.get(k) || 0) + 1;
  hits.set(k, n);
  if (hits.size > 5000) hits.clear();
  return n > max;
}
export const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
