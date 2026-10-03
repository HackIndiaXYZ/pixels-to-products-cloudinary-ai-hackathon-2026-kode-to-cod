import cloudinary, { mirrorContext, invalidate } from '../../lib/cloudinary';
import { load, mutate, audit, uid } from '../../lib/db';
import { buildKit } from '../../lib/media';

const need = (v, msg) => { if (!v) throw new Error(msg); return v; };
const iso = (v, label) => { const t = Date.parse(v); if (Number.isNaN(t)) throw new Error(`${label} is not a valid date`); return new Date(t).toISOString(); };
const list = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((s) => String(s).trim()).filter(Boolean);
const getAsset = (db, id) => need(db.assets[id], 'Unknown asset');

const actions = {
  async list() {
    const db = await load();
    return { cloud_name: process.env.CLOUDINARY_CLOUD_NAME, ...db, audit: db.audit.slice(-300).reverse() };
  },

  async createCampaign(b) {
    return mutate((db) => {
      const c = {
        id: uid('c'), title: need(String(b.title || '').trim(), 'Title is required'), owner: String(b.owner || '').trim(),
        territories: list(b.territories), titles: b.titles || {}, certification: String(b.certification || '').trim(),
        embargo_at: b.embargo_at ? iso(b.embargo_at, 'Embargo date') : null, created: new Date().toISOString(),
      };
      db.campaigns[c.id] = c;
      audit(db, { type: 'campaign_created', campaignId: c.id, detail: c.title });
      return c;
    });
  },

  async signUpload({ resource_type, type, public_id, tags }) {
    need(['image', 'video', 'raw'].includes(resource_type), 'Bad resource type');
    need(['authenticated', 'upload'].includes(type), 'Bad delivery type');
    const params = { timestamp: Math.round(Date.now() / 1000), type };
    if (public_id) params.public_id = public_id;
    if (tags) params.tags = tags;
    const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET);
    return { ...params, signature, api_key: process.env.CLOUDINARY_API_KEY, cloud_name: process.env.CLOUDINARY_CLOUD_NAME };
  },

  async registerAsset(b) {
    const asset = await mutate((db) => {
      need(db.campaigns[b.campaignId], 'Unknown campaign');
      need(['image', 'video'].includes(b.kind), 'Kind must be image or video');
      const cb = b.cover_box;
      const a = {
        id: uid('a'), campaignId: b.campaignId, name: String(b.name || 'Untitled').trim(), kind: b.kind,
        public_id: need(b.public_id, 'public_id missing'), reveal_at: iso(b.reveal_at, 'Reveal time'),
        cover_box: cb && cb.w > 0 && cb.h > 0 ? { x: cb.x | 0, y: cb.y | 0, w: cb.w | 0, h: cb.h | 0 } : null,
        cover_start: b.cover_start === '' || b.cover_start == null ? null : Math.max(0, Number(b.cover_start)),
        territories: list(b.territories), open_link: b.open_link !== false,
        approved: false, approved_by: null, approved_at: null, subtitles: {}, endcards: {},
        versions: [{ n: 1, public_id: b.public_id, created: new Date().toISOString(), status: 'current' }],
        created: new Date().toISOString(),
      };
      db.assets[a.id] = a;
      audit(db, { type: 'asset_uploaded', campaignId: a.campaignId, assetId: a.id, detail: a.name });
      return a;
    });
    const db = await load();
    asset.context_saved = await mirrorContext(asset, db.campaigns[asset.campaignId]);
    return asset;
  },

  async approve({ assetId, by }) {
    return mutate((db) => {
      const a = getAsset(db, assetId);
      a.approved = true; a.approved_by = need(String(by || '').trim(), 'Approver name is required'); a.approved_at = new Date().toISOString();
      audit(db, { type: 'asset_approved', campaignId: a.campaignId, assetId, detail: a.approved_by });
      return a;
    });
  },

  async setReveal({ assetId, reveal_at }) {
    const a = await mutate((db) => {
      const x = getAsset(db, assetId);
      x.reveal_at = iso(reveal_at, 'Reveal time');
      audit(db, { type: 'reveal_rescheduled', campaignId: x.campaignId, assetId, detail: x.reveal_at });
      return x;
    });
    const db = await load();
    await Promise.all([mirrorContext(a, db.campaigns[a.campaignId]), invalidate(a)]);
    return a;
  },

  async replaceMaster({ assetId, public_id }) {
    const a = await mutate((db) => {
      const x = getAsset(db, assetId);
      need(public_id, 'public_id missing');
      x.versions.forEach((v) => { v.status = 'superseded'; });
      x.versions.push({ n: x.versions.length + 1, public_id, created: new Date().toISOString(), status: 'current' });
      x.public_id = public_id; x.approved = false; x.approved_by = null; // new version needs fresh approval
      audit(db, { type: 'asset_replaced', campaignId: x.campaignId, assetId, detail: `v${x.versions.length}` });
      return x;
    });
    const db = await load();
    await mirrorContext(a, db.campaigns[a.campaignId]);
    return a;
  },

  async addSubtitle({ assetId, lang, public_id }) {
    return mutate((db) => {
      const a = getAsset(db, assetId);
      a.subtitles[need(String(lang || '').trim(), 'Language is required')] = need(public_id, 'public_id missing');
      audit(db, { type: 'subtitle_added', campaignId: a.campaignId, assetId, detail: lang });
      return a;
    });
  },

  async addEndCard({ assetId, territory, public_id }) {
    return mutate((db) => {
      const a = getAsset(db, assetId);
      a.endcards[need(String(territory || '').trim(), 'Territory is required')] = need(public_id, 'public_id missing');
      audit(db, { type: 'endcard_added', campaignId: a.campaignId, assetId, detail: territory });
      return a;
    });
  },

  async addRecipient(b) {
    return mutate((db) => {
      need(db.campaigns[b.campaignId], 'Unknown campaign');
      const r = {
        token: uid('rt'), campaignId: b.campaignId, name: need(String(b.name || '').trim(), 'Name is required'),
        org: String(b.org || '').trim(), group: String(b.group || 'Press').trim(), territory: String(b.territory || '').trim(),
        expires_at: b.expires_at ? iso(b.expires_at, 'Expiry') : null, reveal_at: b.reveal_at ? iso(b.reveal_at, 'Reveal time') : null,
        can_download: !!b.can_download, mark: !!b.mark, created: new Date().toISOString(),
      };
      db.recipients[r.token] = r;
      audit(db, { type: 'recipient_added', campaignId: r.campaignId, recipient: r.token, detail: `${r.name} (${r.group})` });
      return r;
    });
  },

  async expireRecipient({ token }) {
    return mutate((db) => {
      const r = need(db.recipients[token], 'Unknown recipient');
      r.expires_at = new Date(Date.now() - 1000).toISOString();
      audit(db, { type: 'recipient_expired', campaignId: r.campaignId, recipient: token, detail: r.name });
      return r;
    });
  },

  async kit({ assetId }) {
    return mutate((db) => {
      const a = getAsset(db, assetId);
      const camp = db.campaigns[a.campaignId];
      const recs = a.kind === 'video' ? Object.values(db.recipients).filter((r) => r.campaignId === a.campaignId) : [];
      const items = buildKit(a, camp, recs).map((i) => ({
        ...i, assetId, source: a.public_id, approved_by: a.approved_by, created: new Date().toISOString(),
      }));
      db.variants = db.variants.filter((v) => v.assetId !== assetId).concat(items); // lineage: source, settings, approver
      audit(db, { type: 'kit_generated', campaignId: a.campaignId, assetId, detail: `${items.length} variants` });
      return { items, warning: a.approved ? null : 'This asset is not approved yet. Kit items are for internal review only.' };
    });
  },

  async report({ campaignId }) {
    const db = await load();
    const ev = db.audit.filter((e) => e.campaignId === campaignId);
    const assets = Object.values(db.assets).filter((a) => a.campaignId === campaignId).map((a) => {
      const mine = ev.filter((e) => e.type === 'access' && e.assetId === a.id);
      const n = (o) => mine.filter((e) => e.outcome === o).length;
      return { id: a.id, name: a.name, approved: a.approved, covered: n('covered'), clear: n('clear'), downloads: n('download'), denied: mine.filter((e) => String(e.outcome).startsWith('denied')).length };
    });
    const recipients = Object.values(db.recipients).filter((r) => r.campaignId === campaignId).map((r) => {
      const mine = ev.filter((e) => e.type === 'access' && e.recipient === r.token);
      return { name: r.name, org: r.org, group: r.group, opens: mine.length, last: mine.length ? mine[mine.length - 1].t : null, expired: !!r.expires_at && Date.parse(r.expires_at) < Date.now() };
    });
    const exceptions = ev.filter((e) => e.type === 'access' && String(e.outcome).startsWith('denied')).slice(-50).reverse();
    return { assets, recipients, exceptions, events: ev.slice(-150).reverse() };
  },

  // Search: studio records plus Cloudinary's Search API (by tag). The Cloudinary half is best effort.
  async search({ q }) {
    const term = String(q || '').trim().toLowerCase();
    const db = await load();
    const local = Object.values(db.assets).filter((a) => !term || a.name.toLowerCase().includes(term) || a.public_id.includes(term) || (db.campaigns[a.campaignId]?.title || '').toLowerCase().includes(term));
    let remote = [];
    try {
      const r = await cloudinary.search.expression(term ? `tags=${term.replace(/[^a-z0-9_-]/g, '')}` : 'tags=unveil').max_results(20).execute();
      remote = r.resources.map((x) => ({ public_id: x.public_id, type: x.type, resource_type: x.resource_type, tags: x.tags }));
    } catch (e) { /* plan or network dependent */ }
    return { local, remote };
  },

  async csv({ campaignId }) {
    const db = await load();
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = db.audit.filter((e) => e.campaignId === campaignId).map((e) => {
      const r = e.recipient && db.recipients[e.recipient];
      const a = e.assetId && db.assets[e.assetId];
      return [e.t, e.type, a ? a.name : '', r ? `${r.name} (${r.org})` : '', e.outcome || '', e.detail || ''].map(q).join(',');
    });
    return { csv: ['time,event,asset,recipient,outcome,detail', ...rows].join('\n') };
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.STUDIO_KEY || req.headers['x-studio-key'] !== process.env.STUDIO_KEY) return res.status(401).json({ error: 'Wrong studio key' });
  const { action, ...body } = req.body || {};
  const fn = actions[action];
  if (!fn) return res.status(400).json({ error: 'Unknown action' });
  try {
    res.json(await fn(body));
  } catch (e) {
    res.status(400).json({ error: e.message || String(e) });
  }
}
