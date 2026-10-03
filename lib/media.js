import { signedUrl } from './cloudinary';

const IMG = { width: 1080, crop: 'limit' };
const VID = { width: 1280, crop: 'limit' };
const clean = (s, n = 60) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

// Visible text layer. Deters casual sharing; it is NOT forensic watermarking.
export const textLayer = (text, size, opts = {}) => ({
  overlay: { font_family: 'Arial', font_size: size, font_weight: 'bold', text: clean(text) || ' ' },
  color: 'white', ...opts,
});

// The reveal engine's transformation: covered before the reveal time, clear after.
export function revealTransform(asset, live, rec) {
  const t = [];
  if (asset.kind === 'image') {
    if (!live) {
      const b = asset.cover_box;
      t.push(b ? { effect: 'pixelate_region:60', x: b.x, y: b.y, width: b.w, height: b.h } : { effect: 'pixelate:60' });
    }
    t.push(IMG);
  } else {
    // Video: cut-based cover. Before T serve only the footage before the spoiler, or blur everything.
    if (!live) t.push(asset.cover_start != null ? { start_offset: 0, end_offset: asset.cover_start } : { effect: 'blur:2000' });
    t.push(VID);
  }
  if (rec && rec.mark) t.push(textLayer(`${rec.name} / ${rec.org}`, asset.kind === 'image' ? 34 : 26, { opacity: 45, gravity: 'center' }));
  return t;
}

export const imageUrl = (asset, live, rec, extra = {}) =>
  signedUrl(asset.public_id, asset.kind, revealTransform(asset, live, rec), asset.kind === 'video' ? { format: 'mp4', ...extra } : { quality: 'auto', fetch_format: 'auto', ...extra });

const SIZES = {
  square_1x1: { ar: '1:1', w: 1080 },
  portrait_4x5: { ar: '4:5', w: 1080 },
  story_9x16: { ar: '9:16', w: 1080 },
  banner_16x9: { ar: '16:9', w: 1600 },
};

// Release kit. Every item is a signed URL that Cloudinary renders on first request.
export function buildKit(asset, camp, recipients) {
  const out = [];
  const add = (group, label, params, url) => out.push({ group, label, params, url });
  const u = (t, extra = {}) => signedUrl(asset.public_id, asset.kind, t, extra);

  if (asset.kind === 'image') {
    const titles = Object.keys(camp.titles || {}).length ? camp.titles : { Original: asset.name };
    const rating = camp.certification || 'RATING'; // placeholder: check current certification rules
    for (const [lang, title] of Object.entries(titles)) {
      for (const [name, s] of Object.entries(SIZES)) {
        const t = [
          { aspect_ratio: s.ar, width: s.w, crop: 'fill', gravity: 'auto' },
          textLayer(title, Math.round(s.w / 12), { gravity: 'south', y: 40 }),
          textLayer(rating, Math.round(s.w / 28), { background: '#b3261e', gravity: 'north_east', x: 24, y: 24 }),
        ];
        add(`Poster / ${lang}`, name, `${s.ar} fill g_auto + title + rating placeholder`, u(t, { quality: 'auto', fetch_format: 'auto' }));
      }
    }
    return out;
  }

  const mp4 = { format: 'mp4' };
  add('Teasers', 'teaser_15s', 'trim 0-15s', u([{ start_offset: 0, duration: 15 }, VID], mp4));
  add('Teasers', 'teaser_30s', 'trim 0-30s', u([{ start_offset: 0, duration: 30 }, VID], mp4));
  add('Teasers', 'vertical_9x16', '9:16 fill, subject-aware gravity', u([{ aspect_ratio: '9:16', crop: 'fill', gravity: 'auto', height: 1280 }], mp4));
  add('Teasers', 'ai_highlight_10s', 'AI preview (plan-dependent)', u([{ effect: 'preview:duration_10' }, VID], mp4));
  add('Social', 'whatsapp_gif', 'animated GIF, 5s', u([{ start_offset: 0, duration: 5 }, { width: 480, crop: 'limit' }], { format: 'gif' }));
  add('Social', 'whatsapp_webp', 'animated WebP, 5s', u([{ start_offset: 0, duration: 5 }, { width: 480, crop: 'limit' }], { format: 'webp' }));
  add('Streaming', 'hls_adaptive', 'adaptive HLS (verify on your plan)', u([], { streaming_profile: 'auto', format: 'm3u8' }));
  for (const [lang, srt] of Object.entries(asset.subtitles || {})) {
    add('Subtitled trailers', lang, 'subtitle overlay from SRT', u([VID, { overlay: { resource_type: 'subtitles', public_id: srt } }, { flags: 'layer_apply' }], mp4));
  }
  for (const [territory, card] of Object.entries(asset.endcards || {})) {
    add('End cards', territory, 'splice region end card', u([{ width: 1280, height: 720, crop: 'pad' }, { flags: 'splice', overlay: { resource_type: 'video', public_id: card } }, { width: 1280, height: 720, crop: 'pad' }, { flags: 'layer_apply' }], mp4));
  }
  for (const r of recipients) {
    add('Screener copies', `${r.name} (${r.org})`, 'visible recipient overlay (deterrent only)', u([VID, textLayer(`${r.name} / ${r.org}`, 28, { opacity: 40, gravity: 'center' })], mp4));
  }
  return out;
}

// Fan campaign: ticket-style image with a fan's name and a theatre's show time.
export function fanUrl(asset, name, show) {
  const t = [{ width: 900, crop: 'limit' }, textLayer(name, 60, { gravity: 'south', y: 90 })];
  if (show) t.push(textLayer(show, 36, { gravity: 'south', y: 30 }));
  return signedUrl(asset.public_id, 'image', t, { quality: 'auto', fetch_format: 'auto' });
}
