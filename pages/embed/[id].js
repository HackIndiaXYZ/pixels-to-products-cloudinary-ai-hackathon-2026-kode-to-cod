import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';

const pad = (n) => String(n).padStart(2, '0');
const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`; };
const safeTz = (tz) => { try { new Intl.DateTimeFormat([], { timeZone: tz }); return tz; } catch { return undefined; } };

// Embeddable reveal. Shows the reveal time in the viewer's own time zone and flips at T with no reload.
export default function Embed() {
  const { id, rt, tz } = useRouter().query;
  const [st, setSt] = useState(null);
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(Date.now());
  const [ver, setVer] = useState(0);
  const wasLive = useRef(null);

  useEffect(() => {
    if (!id) return undefined;
    let stop = false;
    const poll = async () => {
      try {
        const s = await (await fetch(`/api/state/${id}${rt ? `?rt=${encodeURIComponent(rt)}` : ''}`, { cache: 'no-store' })).json();
        if (stop) return;
        if (s.now) setOffset(s.now - Date.now());
        if (wasLive.current === false && s.live) setVer(Date.now()); // the flip
        if (s.allowed) wasLive.current = s.live;
        setSt(s);
      } catch (e) { /* keep polling */ }
    };
    poll();
    const p = setInterval(poll, 3000);
    const t = setInterval(() => setTick(Date.now()), 250);
    return () => { stop = true; clearInterval(p); clearInterval(t); };
  }, [id, rt]);

  const left = st && st.reveal_at ? Date.parse(st.reveal_at) - (tick + offset) : 0;
  const live = !!st && st.allowed && (st.live || left <= 0);

  // Local clock reached T: refresh right away rather than waiting for the next poll.
  useEffect(() => { if (st && st.allowed && !st.live && left <= 0 && wasLive.current === false) { wasLive.current = true; setVer(Date.now()); } }, [left <= 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const src = id ? `/r/${id}?${rt ? `rt=${encodeURIComponent(rt)}&` : ''}v=${ver}` : null;
  const when = st && st.reveal_at ? new Date(st.reveal_at).toLocaleString([], { timeZone: safeTz(tz), day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }) : '';

  if (st && !st.allowed) return <div className="embed"><p className="blocked">{st.message}</p></div>;
  return (
    <div className="embed">
      {src && st && (st.kind === 'video'
        ? <video key={ver} src={src} controls muted playsInline preload="metadata" />
        : <img key={ver} src={src} alt={st.title || 'Reveal'} />)}
      <div className={`badge ${live ? 'on' : ''}`}>
        {!st ? 'Loading' : live ? 'Revealed' : `Reveals in ${fmt(left)}`}
        {st && !live && <small>{when}</small>}
      </div>
      {live && st.can_download && <a className="dl" href={`${src}&dl=1`}>Download</a>}
      <a className="synced" href="/" target="_blank" rel="noreferrer">Reveal synced by Unveil</a>
    </div>
  );
}
