// End-to-end check of the server logic. Needs the app running: STUDIO_KEY=k npm start, then BASE=http://localhost:3000 npm test
const BASE = process.env.BASE || 'http://localhost:3000';
const KEY = process.env.STUDIO_KEY || 'k';
let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };
const api = async (action, body = {}) => (await fetch(`${BASE}/api/studio`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-studio-key': KEY }, body: JSON.stringify({ action, ...body }) })).json();
const get = (p) => fetch(`${BASE}${p}`, { redirect: 'manual' });

(async () => {
  ok((await (await fetch(`${BASE}/api/studio`, { method: 'POST', headers: { 'x-studio-key': 'bad' } })).json()).error === 'Wrong studio key', 'studio rejects wrong key');
  const c = await api('createCampaign', { title: 'Test Film', owner: 'QA', territories: 'Kerala, Tamil Nadu', titles: { Tamil: 'சோதனை', Hindi: 'टेस्ट' }, certification: 'U/A' });
  ok(c.id, 'campaign created');
  const img = await api('registerAsset', { campaignId: c.id, name: 'Poster', kind: 'image', public_id: 'sample_poster', reveal_at: new Date(Date.now() + 3600e3).toISOString(), cover_box: { x: 100, y: 80, w: 200, h: 150 }, territories: 'Kerala', open_link: true });
  ok(img.id, 'image asset registered');
  let r = await get(`/r/${img.id}`);
  ok(r.status === 403, 'unapproved asset is blocked');
  await api('approve', { assetId: img.id, by: 'Priya' });
  r = await get(`/r/${img.id}`);
  const covered = r.headers.get('location') || '';
  ok(r.status === 302 && /no-store/.test(r.headers.get('cache-control')), 'redirect is 302 + no-store');
  ok(/pixelate_region:60/.test(covered) && /\/authenticated\//.test(covered) && /s--/.test(covered), 'before T: signed authenticated URL with pixelated region');
  await api('setReveal', { assetId: img.id, reveal_at: new Date(Date.now() - 1000).toISOString() });
  r = await get(`/r/${img.id}`);
  const clear = r.headers.get('location') || '';
  ok(!/pixelate/.test(clear) && clear !== covered, 'after T: same link now points to the clear version');
  const st = await (await get(`/api/state/${img.id}`)).json();
  ok(st.allowed && st.live === true && st.kind === 'image', 'state endpoint reports live');

  const rec = await api('addRecipient', { campaignId: c.id, name: 'Ravi', org: 'ReelBuzz', territory: 'Kerala', expires_at: new Date(Date.now() + 3600e3).toISOString(), can_download: true, mark: true });
  r = await get(`/r/${img.id}?rt=${rec.token}`);
  ok(r.status === 302 && /l_text/.test(r.headers.get('location')), 'recipient link works and carries visible mark');
  r = await get(`/r/${img.id}?rt=${rec.token}&dl=1`);
  ok(r.status === 302 && /fl_attachment/.test(r.headers.get('location')), 'download allowed after reveal');
  r = await get(`/r/${img.id}?rt=nope`);
  ok(r.status === 403, 'bad token denied');
  const out = await api('addRecipient', { campaignId: c.id, name: 'Out', org: 'X', territory: 'Overseas' });
  r = await get(`/r/${img.id}?rt=${out.token}`);
  ok(r.status === 403, 'territory restriction enforced');
  await api('expireRecipient', { token: rec.token });
  r = await get(`/r/${img.id}?rt=${rec.token}`);
  ok(r.status === 410, 'expired link returns 410');

  const kit = await api('kit', { assetId: img.id });
  ok(kit.items && kit.items.length === 8 && kit.items.every((i) => /s--/.test(i.url)), 'poster kit: 2 languages x 4 sizes, all signed');
  r = await get(`/api/fan/${img.id}?name=${encodeURIComponent('Asha, K/R')}&show=${encodeURIComponent('Sat 7:30 PM')}`);
  ok(r.status === 302 && /l_text/.test(r.headers.get('location')), 'fan poster redirect');

  const vid = await api('registerAsset', { campaignId: c.id, name: 'Trailer', kind: 'video', public_id: 'sample_trailer', reveal_at: new Date(Date.now() + 3600e3).toISOString(), cover_start: 42, open_link: true });
  await api('approve', { assetId: vid.id, by: 'Priya' });
  await api('addSubtitle', { assetId: vid.id, lang: 'Tamil', public_id: 'unveil_x_tamil.srt' });
  await api('addEndCard', { assetId: vid.id, territory: 'Kerala', public_id: 'endcard_kerala' });
  r = await get(`/r/${vid.id}`);
  ok(r.status === 302 && /eo_42/.test(r.headers.get('location')) && /\.mp4/.test(r.headers.get('location')), 'video before T: cut-based cover (trimmed at spoiler)');
  const vk = await api('kit', { assetId: vid.id });
  const labels = vk.items.map((i) => i.label).join(',');
  ok(['teaser_15s', 'teaser_30s', 'vertical_9x16', 'whatsapp_gif', 'whatsapp_webp', 'hls_adaptive', 'Tamil', 'Kerala', 'Ravi (ReelBuzz)'].every((l) => labels.includes(l)), 'video kit: teasers, vertical, GIF/WebP, HLS, subtitles, end card, screener');
  console.log('      sample subtitle URL:', vk.items.find((i) => i.group === 'Subtitled trailers').url);
  console.log('      sample end-card URL:', vk.items.find((i) => i.group === 'End cards').url);

  const rep = await api('report', { campaignId: c.id });
  ok(rep.assets.length === 2 && rep.exceptions.length > 0, 'report has assets and exceptions');
  const csv = await api('csv', { campaignId: c.id });
  ok(csv.csv.split('\n').length > 5, 'CSV export');
  for (const p of ['/', `/embed/${img.id}`, `/partners/reelbuzz?id=${img.id}`, `/partners/cityplex?id=${img.id}&tz=Europe/London`]) ok((await get(p)).status === 200, `page ${p}`);
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
