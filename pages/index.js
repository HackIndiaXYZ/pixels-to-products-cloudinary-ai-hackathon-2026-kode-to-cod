import { useCallback, useEffect, useRef, useState } from 'react';

const local = (iso) => (iso ? new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }) : 'none');
const inputDT = (minutes) => new Date(Date.now() + minutes * 60000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const toISO = (v) => (v ? new Date(v).toISOString() : '');

async function call(key, action, body = {}) {
  const r = await fetch('/api/studio', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-studio-key': key }, body: JSON.stringify({ action, ...body }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
}

// Signed direct-to-Cloudinary upload. The API secret never reaches the browser.
async function upload(key, file, { resource_type, type, public_id, tags }) {
  const s = await call(key, 'signUpload', { resource_type, type, public_id, tags });
  const fd = new FormData();
  fd.append('file', file);
  fd.append('api_key', s.api_key);
  fd.append('timestamp', s.timestamp);
  fd.append('type', type);
  if (public_id) fd.append('public_id', public_id);
  if (tags) fd.append('tags', tags);
  fd.append('signature', s.signature);
  const r = await fetch(`https://api.cloudinary.com/v1_1/${s.cloud_name}/${resource_type}/upload`, { method: 'POST', body: fd });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j;
}

function BoxPicker({ src, onChange }) {
  const img = useRef(null);
  const start = useRef(null);
  const [b, setB] = useState(null);
  const pt = (e) => { const r = img.current.getBoundingClientRect(); return { x: Math.min(Math.max(e.clientX - r.left, 0), r.width), y: Math.min(Math.max(e.clientY - r.top, 0), r.height) }; };
  const emit = (nb) => {
    const k = img.current.naturalWidth / img.current.getBoundingClientRect().width;
    onChange(nb && nb.w > 4 && nb.h > 4 ? { x: Math.round(nb.x * k), y: Math.round(nb.y * k), w: Math.round(nb.w * k), h: Math.round(nb.h * k) } : null);
  };
  const rect = (p) => ({ x: Math.min(start.current.x, p.x), y: Math.min(start.current.y, p.y), w: Math.abs(p.x - start.current.x), h: Math.abs(p.y - start.current.y) });
  return (
    <div className="stage"
      onPointerDown={(e) => { start.current = pt(e); setB({ ...start.current, w: 0, h: 0 }); e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => { if (start.current) { const nb = rect(pt(e)); setB(nb); emit(nb); } }}
      onPointerUp={() => { start.current = null; }}>
      <img ref={img} src={src} alt="Poster preview: drag to mark the spoiler region" draggable={false} />
      {b && <div className="box" style={{ left: b.x, top: b.y, width: b.w, height: b.h }} />}
    </div>
  );
}

export default function Studio() {
  const [key, setKey] = useState('');
  const [data, setData] = useState(null);
  const [cid, setCid] = useState('');
  const [tab, setTab] = useState('campaign');
  const [msg, setMsg] = useState({ t: '', bad: false });
  const say = (t, bad = false) => setMsg({ t, bad });

  const reload = useCallback(async (k = key) => {
    const d = await call(k, 'list');
    setData(d);
    setCid((c) => (c && d.campaigns[c] ? c : Object.keys(d.campaigns)[0] || ''));
    return d;
  }, [key]);

  async function login() {
    try { await reload(key); sessionStorage.setItem('unveil_key', key); say(''); } catch (e) { say(e.message, true); }
  }
  useEffect(() => {
    const k = sessionStorage.getItem('unveil_key');
    if (k) { setKey(k); reload(k).catch(() => {}); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = (label, fn) => async (...a) => {
    try { say(`${label}...`); await fn(...a); await reload(); say(`${label}: done`); } catch (e) { say(`${label} failed: ${e.message}`, true); }
  };
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  if (!data) {
    return (
      <main className="wrap">
        <h1>Unveil</h1>
        <p className="tag">Every reveal, same second, every screen.</p>
        <label>Studio key<input type="password" value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && login()} /></label>
        <button onClick={login} disabled={!key}>Enter studio</button>
        <p className={msg.bad ? 'err' : 'msg'}>{msg.t}</p>
      </main>
    );
  }

  const camp = data.campaigns[cid];
  const assets = Object.values(data.assets).filter((a) => a.campaignId === cid);
  const recipients = Object.values(data.recipients).filter((r) => r.campaignId === cid);
  const ctx = { apiKey: key, data, camp, assets, recipients, run, say, origin, reload };

  return (
    <main className="wrap">
      <h1>Unveil</h1>
      <p className="tag">Every reveal, same second, every screen.</p>
      <label>Campaign
        <select value={cid} onChange={(e) => setCid(e.target.value)}>
          <option value="">{Object.keys(data.campaigns).length ? 'Choose a campaign' : 'No campaigns yet: create one below'}</option>
          {Object.values(data.campaigns).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </label>
      <div className="tabs" role="tablist">
        {[['campaign', 'Campaign'], ['assets', 'Assets'], ['recipients', 'Recipients'], ['kit', 'Release kit'], ['report', 'Report'], ['search', 'Search']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <p className={msg.bad ? 'err' : 'msg'} role="status">{msg.t}</p>
      {tab === 'campaign' && <CampaignForm {...ctx} setCid={setCid} />}
      {tab !== 'campaign' && !camp && <p className="hint">Create or choose a campaign first.</p>}
      {camp && tab === 'assets' && <AssetsTab {...ctx} />}
      {camp && tab === 'recipients' && <RecipientsTab {...ctx} />}
      {camp && tab === 'kit' && <KitTab {...ctx} />}
      {camp && tab === 'report' && <ReportTab {...ctx} />}
      {tab === 'search' && <SearchTab {...ctx} />}
      <p className="hint">Not DRM. Cannot stop screen recording or copies already taken. Rating badges are placeholders. Link opens do not prove anyone watched.</p>
    </main>
  );
}

function CampaignForm({ camp, run, setCid, apiKey }) {
  const [f, setF] = useState({ title: '', owner: '', territories: 'Tamil Nadu, Kerala, Overseas', titles: 'Hindi: \nTamil: ', certification: '', embargo_at: inputDT(60) });
  const set = (n) => (e) => setF({ ...f, [n]: e.target.value });
  const create = run('Create campaign', async () => {
    const titles = {};
    f.titles.split('\n').forEach((l) => { const [a, ...b] = l.split(':'); if (a && b.join(':').trim()) titles[a.trim()] = b.join(':').trim(); });
    const c = await call(apiKey, 'createCampaign', { ...f, titles, embargo_at: toISO(f.embargo_at) });
    setCid(c.id);
  });
  return (
    <>
      {camp && (
        <div className="card">
          <h2>{camp.title}</h2>
          <p>Owner: {camp.owner || 'n/a'} · Territories: {camp.territories.join(', ') || 'all'} · Certification: {camp.certification || 'placeholder'} · Embargo: {local(camp.embargo_at)}</p>
          <p>Titles: {Object.entries(camp.titles).map(([l, t]) => `${l}: ${t}`).join(' · ') || 'none'}</p>
        </div>
      )}
      <h3>New campaign</h3>
      <div className="row">
        <label>Film title<input value={f.title} onChange={set('title')} /></label>
        <label>Campaign owner<input value={f.owner} onChange={set('owner')} /></label>
        <label>Territories (comma separated)<input value={f.territories} onChange={set('territories')} /></label>
        <label>Certification text (placeholder badge)<input value={f.certification} onChange={set('certification')} placeholder="e.g. U/A 13+" /></label>
        <label>Campaign embargo (your local time)<input type="datetime-local" value={f.embargo_at} onChange={set('embargo_at')} /></label>
      </div>
      <label>Titles per language (one per line, Language: Title)<textarea rows={3} value={f.titles} onChange={set('titles')} /></label>
      <button onClick={create} disabled={!f.title.trim()}>Create campaign</button>
    </>
  );
}

function AssetsTab({ apiKey, camp, assets, run, say, origin }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [name, setName] = useState('');
  const [when, setWhen] = useState(inputDT(2));
  const [box, setBox] = useState(null);
  const [coverStart, setCoverStart] = useState('');
  const [terr, setTerr] = useState('');
  const [open, setOpen] = useState(true);
  const isVideo = file && file.type.startsWith('video');

  const pick = (f) => { setFile(f); setBox(null); setPreview(f && f.type.startsWith('image') ? URL.createObjectURL(f) : null); if (f && !name) setName(f.name.replace(/\.[^.]+$/, '')); };
  const create = run('Upload and schedule', async () => {
    const kind = isVideo ? 'video' : 'image';
    const up = await upload(apiKey, file, { resource_type: kind, type: 'authenticated', tags: `unveil,${camp.id}` });
    const a = await call(apiKey, 'registerAsset', { campaignId: camp.id, name, kind, public_id: up.public_id, reveal_at: toISO(when), cover_box: box, cover_start: coverStart, territories: terr, open_link: open });
    say(a.context_saved ? 'Saved. Rules mirrored to Cloudinary context.' : 'Saved. (Cloudinary context mirror skipped.)');
    setFile(null); setPreview(null); setBox(null); setName('');
  });

  return (
    <>
      <h3>Upload a master (kept private as an authenticated Cloudinary asset)</h3>
      <label>Poster, still or trailer<input type="file" accept="image/*,video/*" onChange={(e) => pick(e.target.files[0])} /></label>
      {preview && <><p className="hint">Drag over the region that must stay hidden until the reveal.</p><BoxPicker src={preview} onChange={setBox} /></>}
      <div className="row">
        <label>Asset name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Reveal time (your local time; stored as UTC)<input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>
        <label>Limit to territories (optional, comma separated)<input value={terr} onChange={(e) => setTerr(e.target.value)} placeholder={camp.territories.join(', ')} /></label>
        {isVideo && <label>Spoiler starts at (seconds, optional). Before T only the footage before this plays.<input type="number" min="0" value={coverStart} onChange={(e) => setCoverStart(e.target.value)} /></label>}
      </div>
      <label><input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />Allow the open link (no recipient token needed)</label>
      <button onClick={create} disabled={!file || !name.trim() || !when}>Upload and schedule</button>
      <h3>Assets</h3>
      {!assets.length && <p className="hint">No assets yet.</p>}
      {assets.map((a) => <AssetCard key={a.id} a={a} apiKey={apiKey} run={run} origin={origin} />)}
    </>
  );
}

function AssetCard({ a, apiKey, run, origin }) {
  const [by, setBy] = useState('');
  const [when, setWhen] = useState(inputDT(5));
  const [lang, setLang] = useState('');
  const [terr, setTerr] = useState('');
  const link = `${origin}/r/${a.id}`;
  const files = (setter) => (e) => setter(e.target.files[0]);
  const [srt, setSrt] = useState(null);
  const [card, setCard] = useState(null);
  const [master, setMaster] = useState(null);

  return (
    <div className="card">
      <h2>{a.name} <span className="pill">{a.kind}</span><span className={`pill ${a.approved ? 'ok' : ''}`}>{a.approved ? `approved by ${a.approved_by}` : 'awaiting approval'}</span></h2>
      <p>Reveal: {local(a.reveal_at)} <span className="hint">(UTC {a.reveal_at})</span></p>
      <p>Link: <code>{link}</code> · <a href={`/embed/${a.id}`} target="_blank" rel="noreferrer">embed</a> · <a href={`/partners/reelbuzz?id=${a.id}`} target="_blank" rel="noreferrer">ReelBuzz demo</a> · <a href={`/partners/cityplex?id=${a.id}&tz=Europe/London`} target="_blank" rel="noreferrer">CityPlex demo (London time)</a>{a.kind === 'image' && <> · <a href={`/api/fan/${a.id}?name=Asha&show=Sat 7:30 PM`} target="_blank" rel="noreferrer">fan poster</a></>}</p>
      {!a.approved && (
        <div className="row"><label>Approver name<input value={by} onChange={(e) => setBy(e.target.value)} /></label>
          <button onClick={run('Approve', () => call(apiKey, 'approve', { assetId: a.id, by }))} disabled={!by.trim()}>Approve for release</button></div>
      )}
      <div className="row">
        <label>New reveal time (also pulls back an early reveal)<input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>
        <button className="ghost" onClick={run('Reschedule', () => call(apiKey, 'setReveal', { assetId: a.id, reveal_at: toISO(when) }))}>Reschedule</button>
      </div>
      <div className="row">
        <label>Replace master (new version needs fresh approval)<input type="file" accept={a.kind === 'video' ? 'video/*' : 'image/*'} onChange={files(setMaster)} /></label>
        <button className="ghost" disabled={!master} onClick={run('Replace master', async () => {
          const up = await upload(apiKey, master, { resource_type: a.kind, type: 'authenticated', tags: `unveil,${a.campaignId}` });
          await call(apiKey, 'replaceMaster', { assetId: a.id, public_id: up.public_id });
        })}>Upload new version</button>
      </div>
      {a.kind === 'video' && (
        <>
          <div className="row">
            <label>Subtitle language<input value={lang} onChange={(e) => setLang(e.target.value)} placeholder="Tamil" /></label>
            <label>SRT file<input type="file" accept=".srt" onChange={files(setSrt)} /></label>
            <button className="ghost" disabled={!srt || !lang.trim()} onClick={run('Attach subtitles', async () => {
              const pid = `unveil_${a.id}_${lang.trim().toLowerCase().replace(/[^a-z0-9]/g, '')}.srt`;
              await upload(apiKey, srt, { resource_type: 'raw', type: 'upload', public_id: pid });
              await call(apiKey, 'addSubtitle', { assetId: a.id, lang: lang.trim(), public_id: pid });
            })}>Attach SRT</button>
          </div>
          <div className="row">
            <label>End-card territory<input value={terr} onChange={(e) => setTerr(e.target.value)} placeholder="Kerala" /></label>
            <label>End-card video (same shape as the trailer)<input type="file" accept="video/*" onChange={files(setCard)} /></label>
            <button className="ghost" disabled={!card || !terr.trim()} onClick={run('Attach end card', async () => {
              const up = await upload(apiKey, card, { resource_type: 'video', type: 'upload' });
              await call(apiKey, 'addEndCard', { assetId: a.id, territory: terr.trim(), public_id: up.public_id });
            })}>Attach end card</button>
          </div>
          <p className="hint">Subtitles: {Object.keys(a.subtitles).join(', ') || 'none'} · End cards: {Object.keys(a.endcards).join(', ') || 'none'}</p>
        </>
      )}
      <details><summary>Version history ({a.versions.length})</summary>
        <table><tbody>{a.versions.map((v) => <tr key={v.n}><td>v{v.n}</td><td><code>{v.public_id}</code></td><td>{local(v.created)}</td><td>{v.status === 'current' ? 'current' : 'superseded'}</td></tr>)}</tbody></table>
      </details>
    </div>
  );
}

function RecipientsTab({ apiKey, camp, recipients, assets, run, origin }) {
  const [f, setF] = useState({ name: '', org: '', group: 'Press', territory: '', expires_at: inputDT(60 * 24 * 7), reveal_at: '', can_download: false, mark: false });
  const set = (n) => (e) => setF({ ...f, [n]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const add = run('Add recipient', () => call(apiKey, 'addRecipient', { ...f, campaignId: camp.id, expires_at: toISO(f.expires_at), reveal_at: toISO(f.reveal_at) }));
  return (
    <>
      <h3>New recipient (personal, expiring links)</h3>
      <div className="row">
        <label>Name<input value={f.name} onChange={set('name')} /></label>
        <label>Organisation<input value={f.org} onChange={set('org')} /></label>
        <label>Group<input value={f.group} onChange={set('group')} /></label>
        <label>Territory<input value={f.territory} onChange={set('territory')} placeholder={camp.territories.join(', ')} /></label>
        <label>Link expires<input type="datetime-local" value={f.expires_at} onChange={set('expires_at')} /></label>
        <label>Own reveal time (optional, e.g. early for press)<input type="datetime-local" value={f.reveal_at} onChange={set('reveal_at')} /></label>
      </div>
      <label><input type="checkbox" checked={f.can_download} onChange={set('can_download')} />Can download after reveal</label>
      <label><input type="checkbox" checked={f.mark} onChange={set('mark')} />Show a visible recipient mark (deterrent only)</label>
      <button onClick={add} disabled={!f.name.trim()}>Add recipient</button>
      <h3>Recipients</h3>
      {!recipients.length && <p className="hint">None yet.</p>}
      {recipients.map((r) => {
        const gone = r.expires_at && Date.parse(r.expires_at) < Date.now();
        return (
          <div className="card" key={r.token}>
            <h2>{r.name} <span className="pill">{r.group}</span><span className="pill">{r.org || 'no org'}</span>{gone && <span className="pill">expired</span>}</h2>
            <p>Territory: {r.territory || 'any'} · Expires: {local(r.expires_at)} · Own reveal: {local(r.reveal_at)} · Download: {r.can_download ? 'yes' : 'no'} · Mark: {r.mark ? 'yes' : 'no'}</p>
            {assets.filter((a) => a.approved).map((a) => <p key={a.id}>{a.name}: <code>{origin}/r/{a.id}?rt={r.token}</code> · <a href={`/embed/${a.id}?rt=${r.token}`} target="_blank" rel="noreferrer">open embed</a></p>)}
            {!gone && <button className="ghost" onClick={run('Expire link', () => call(apiKey, 'expireRecipient', { token: r.token }))}>Expire now</button>}
          </div>
        );
      })}
    </>
  );
}

function KitTab({ apiKey, assets, data, run }) {
  const groups = (aid) => {
    const g = {};
    data.variants.filter((v) => v.assetId === aid).forEach((v) => { (g[v.group] = g[v.group] || []).push(v); });
    return g;
  };
  return (
    <>
      <p className="hint">Every variant is a signed Cloudinary URL, rendered on first request and then cached on the CDN. Generate once, reuse the links. Each item records its source, settings and approver.</p>
      {!assets.length && <p className="hint">Upload an asset first.</p>}
      {assets.map((a) => (
        <div className="card" key={a.id}>
          <h2>{a.name}</h2>
          <button onClick={run('Generate kit', () => call(apiKey, 'kit', { assetId: a.id }))}>Generate kit</button>
          {Object.entries(groups(a.id)).map(([g, items]) => (
            <div key={g}><h3>{g}</h3>
              <div className="grid">{items.map((v) => (
                <figure key={v.label + v.url}>
                  {a.kind === 'image' ? <img src={v.url} alt={`${g} ${v.label}`} loading="lazy" /> : null}
                  <figcaption><a href={v.url} target="_blank" rel="noreferrer">{v.label}</a><br /><span className="hint">{v.params}</span></figcaption>
                </figure>))}
              </div>
            </div>
          ))}
          {data.variants.some((v) => v.assetId === a.id) && <p className="hint">Lineage: source <code>{a.public_id}</code>, approver {a.approved_by || 'none yet'}.</p>}
        </div>
      ))}
    </>
  );
}

function ReportTab({ apiKey, camp }) {
  const [rep, setRep] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => call(apiKey, 'report', { campaignId: camp.id }).then(setRep).catch((e) => setErr(e.message)), [apiKey, camp.id]);
  useEffect(() => { load(); }, [load]);
  async function csv() {
    const { csv: text } = await call(apiKey, 'csv', { campaignId: camp.id });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    a.download = `${camp.title}-audit.csv`;
    a.click();
  }
  if (err) return <p className="err">{err}</p>;
  if (!rep) return <p className="hint">Loading...</p>;
  return (
    <>
      <button onClick={load}>Refresh</button><button className="ghost" onClick={csv}>Export audit CSV</button>
      <p className="hint">Opens count link requests. They do not prove that a person watched.</p>
      <h3>Assets</h3>
      <table><thead><tr><th>Asset</th><th>Approved</th><th>Covered opens</th><th>Clear opens</th><th>Downloads</th><th>Denied</th></tr></thead>
        <tbody>{rep.assets.map((a) => <tr key={a.id}><td>{a.name}</td><td>{a.approved ? 'yes' : 'no'}</td><td>{a.covered}</td><td>{a.clear}</td><td>{a.downloads}</td><td>{a.denied}</td></tr>)}</tbody></table>
      <h3>Recipients</h3>
      <table><thead><tr><th>Name</th><th>Org</th><th>Group</th><th>Opens</th><th>Last seen</th><th>Link</th></tr></thead>
        <tbody>{rep.recipients.map((r) => <tr key={r.name + r.org}><td>{r.name}</td><td>{r.org}</td><td>{r.group}</td><td>{r.opens}</td><td>{r.last ? local(r.last) : 'never'}</td><td>{r.expired ? 'expired' : 'active'}</td></tr>)}</tbody></table>
      <h3>Exceptions (denied or expired)</h3>
      {!rep.exceptions.length ? <p className="hint">None.</p> : <table><tbody>{rep.exceptions.map((e, i) => <tr key={i}><td>{local(e.t)}</td><td>{e.assetId}</td><td>{e.outcome}</td></tr>)}</tbody></table>}
      <h3>Activity</h3>
      <table><tbody>{rep.events.map((e, i) => <tr key={i}><td>{local(e.t)}</td><td>{e.type}</td><td>{e.outcome || ''}</td><td>{e.detail || ''}</td></tr>)}</tbody></table>
    </>
  );
}

function SearchTab({ apiKey, data }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const go = async () => { try { setRes(await call(apiKey, 'search', { q })); } catch (e) { setRes({ error: e.message }); } };
  return (
    <>
      <label>Search assets (name, campaign, or a Cloudinary tag)<input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} /></label>
      <button onClick={go}>Search</button>
      {res && res.error && <p className="err">{res.error}</p>}
      {res && res.local && (
        <>
          <h3>Studio</h3>
          {res.local.map((a) => <p key={a.id}>{a.name} <span className="pill">{a.kind}</span> in {data.campaigns[a.campaignId]?.title}</p>)}
          <h3>Cloudinary Search API (by tag)</h3>
          {res.remote.length ? res.remote.map((r) => <p key={r.public_id}><code>{r.public_id}</code> {(r.tags || []).join(', ')}</p>) : <p className="hint">No tag matches, or Search API unavailable on this plan.</p>}
        </>
      )}
    </>
  );
}
