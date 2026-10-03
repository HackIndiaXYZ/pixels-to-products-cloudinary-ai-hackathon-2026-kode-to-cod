import { v2 as cloudinary } from 'cloudinary';

// Accept the single CLOUDINARY_URL form too: cloudinary://API_KEY:API_SECRET@CLOUD_NAME
if (process.env.CLOUDINARY_URL && !process.env.CLOUDINARY_API_SECRET) {
  try {
    const u = new URL(process.env.CLOUDINARY_URL);
    process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || u.hostname;
    process.env.CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || decodeURIComponent(u.username);
    process.env.CLOUDINARY_API_SECRET = decodeURIComponent(u.password);
  } catch (e) { /* ignore a malformed value */ }
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Signed delivery URL for a private (authenticated) master.
export function signedUrl(public_id, resource_type, transformation = [], extra = {}) {
  return cloudinary.url(public_id, { type: 'authenticated', sign_url: true, secure: true, resource_type, transformation, ...extra });
}

// Mirrors the reveal rules into Cloudinary context metadata. Best effort: the app works even if this fails.
export async function mirrorContext(asset, campaign) {
  const esc = (s) => String(s ?? '').replace(/([=|])/g, '\\$1');
  const ctx = [
    `title=${esc(asset.name)}`,
    `campaign=${esc(campaign ? campaign.title : '')}`,
    `reveal_at=${esc(asset.reveal_at)}`,
    `cover_box=${esc(JSON.stringify(asset.cover_box || null))}`,
    `languages=${esc(JSON.stringify(campaign ? campaign.titles : {}))}`,
  ].join('|');
  try {
    await cloudinary.uploader.add_context(ctx, [asset.public_id], { type: 'authenticated', resource_type: asset.kind });
    return true;
  } catch (e) { return false; }
}

// Drops cached derived copies so a rescheduled or pulled-back reveal takes effect at the CDN.
export async function invalidate(asset) {
  try {
    await cloudinary.uploader.explicit(asset.public_id, { type: 'authenticated', resource_type: asset.kind, invalidate: true });
    return true;
  } catch (e) { return false; }
}

export default cloudinary;
