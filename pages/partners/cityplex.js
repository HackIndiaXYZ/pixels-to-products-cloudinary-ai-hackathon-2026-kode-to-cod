import { useRouter } from 'next/router';

// Fictional partner page. It embeds the same Unveil link and flips on its own at the reveal minute.
export default function Partner() {
  const { id, rt, tz } = useRouter().query;
  const qs = new URLSearchParams();
  if (rt) qs.set('rt', rt);
  if (tz) qs.set('tz', tz);
  return (
    <main className="partner cityplex">
      <header><strong>CityPlex Theatres (demo partner)</strong></header>
      <h1>First look: nobody here touches this page at reveal time</h1>
      <p>Published hours ago. The embed below changes by itself at the reveal minute.</p>
      {id ? <iframe src={`/embed/${id}?${qs.toString()}`} title="Unveil reveal" /> : <p className="hint">Add ?id=ASSET_ID to the address (optional: &amp;rt=RECIPIENT_TOKEN &amp;tz=Asia/Kolkata).</p>}
    </main>
  );
}
