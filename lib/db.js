import fs from 'fs';
import os from 'os';
import path from 'path';

// Tiny JSON store. Upstash Redis (REST) if configured, otherwise a local file.
const RURL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const RTOK = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const FILE = process.env.DATA_FILE || path.join(process.env.VERCEL ? os.tmpdir() : process.cwd(), '.data', 'db.json');
const empty = () => ({ campaigns: {}, assets: {}, recipients: {}, variants: [], audit: [] });

async function redis(cmd) {
  const r = await fetch(RURL, { method: 'POST', headers: { Authorization: `Bearer ${RTOK}` }, body: JSON.stringify(cmd) });
  if (!r.ok) throw new Error(`Redis error ${r.status}`);
  return r.json();
}

export async function load() {
  if (RURL) {
    const j = await redis(['GET', 'unveil:db']);
    return j.result ? { ...empty(), ...JSON.parse(j.result) } : empty();
  }
  try { return { ...empty(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { return empty(); }
}

async function save(db) {
  if (RURL) return redis(['SET', 'unveil:db', JSON.stringify(db)]);
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(db));
}

// Serialises writes within one server instance.
let chain = Promise.resolve();
export function mutate(fn) {
  const run = chain.then(async () => { const db = await load(); const out = await fn(db); await save(db); return out; });
  chain = run.catch(() => {});
  return run;
}

export function audit(db, ev) {
  db.audit.push({ t: new Date().toISOString(), ...ev });
  if (db.audit.length > 5000) db.audit.splice(0, db.audit.length - 5000);
}

export const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
export const usingRedis = !!RURL;
