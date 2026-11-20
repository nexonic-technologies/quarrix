import { useEffect, useRef, useState } from 'react';

/* Small graphic pieces used across the app: logo, avatars, orbs, charts and count-up numbers. */

export function Logo({ size = 34 }: { size?: number }) {
  const dots = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    return <circle key={i} cx={20 + Math.cos(a) * 9.5} cy={20 + Math.sin(a) * 9.5} r={i === 3 ? 2.6 : 1.6} fill="#fff" opacity={i === 3 ? 1 : 0.55 + (i % 3) * 0.15} />;
  });
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a78bfa" /><stop offset="0.55" stopColor="#7c3aed" /><stop offset="1" stopColor="#4c1d95" /></linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#lg)" />
      <g className="logo-spin">{dots}</g>
      <path d="M26 26l5 5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

const HUES: [string, string][] = [
  ['#a78bfa', '#7c3aed'], ['#67e8f9', '#0891b2'], ['#f9a8d4', '#db2777'], ['#fdba74', '#ea580c'],
  ['#86efac', '#16a34a'], ['#c4b5fd', '#4f46e5'], ['#fda4af', '#e11d48'], ['#5eead4', '#0d9488'],
];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const [a, b] = HUES[hash(name) % HUES.length];
  const initials = name.replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, ${a}, ${b})` }} aria-hidden>
      {initials}
    </span>
  );
}

/* Glossy floating orbs with drifting sparks, the app's signature graphic. */
export function Orbs({ size = 220 }: { size?: number }) {
  return (
    <div className="orbs" style={{ width: size, height: size }} aria-hidden>
      <div className="orbs-halo" />
      <i className="orb o1" /><i className="orb o2" /><i className="orb o3" /><i className="orb o4" />
      {Array.from({ length: 9 }, (_, i) => <b key={i} className="spark" style={{ ['--i' as string]: i }} />)}
    </div>
  );
}

export function Sparkline({ data, w = 120, h = 36, color = 'var(--violet)' }: { data: number[]; w?: number; h?: number; color?: string }) {
  if (!data.length) return null;
  const max = Math.max(1, ...data);
  const pts = data.map((v, i) => [(i / Math.max(1, data.length - 1)) * w, h - 3 - (v / max) * (h - 6)]);
  const d = pts.map(([x, y], i) => {
    if (!i) return `M${x},${y}`;
    const [px, py] = pts[i - 1];
    const cx = (px + x) / 2;
    return `C${cx},${py} ${cx},${y} ${x},${y}`;
  }).join(' ');
  const id = 'sp' + hash(data.join(',') + color);
  return (
    <svg className="spark-line" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.3" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} />
      <path className="draw" d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Bars({ data, labels, h = 140 }: { data: number[]; labels: string[]; h?: number }) {
  const max = Math.max(1, ...data);
  return (
    <div className="bars" style={{ height: h }}>
      {data.map((v, i) => (
        <div key={i} className="bars-col" title={`${labels[i]}: ${v}`}>
          <span className="bars-v">{v || ''}</span>
          <div className="bars-track"><i style={{ height: `${(v / max) * 100}%`, animationDelay: `${i * 35}ms` }} /></div>
          <span className="bars-l">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

export function Ring({ value, max, size = 64, label }: { value: number; max: number; size?: number; label?: string }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, value / Math.max(1, max));
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#22d3ee" /><stop offset="0.5" stopColor="#8b5cf6" /><stop offset="1" stopColor="#ec4899" /></linearGradient></defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth="6" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#rg)" strokeWidth="6" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - p)} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(.2,.8,.2,1)' }} />
      <text x="50%" y="52%" dominantBaseline="middle" textAnchor="middle">{Math.round(p * 100)}%</text>
    </svg>
  );
}

export function CountUp({ to }: { to: number }) {
  const [n, setN] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 700);
      const v = Math.round(a + (to - a) * (1 - Math.pow(1 - k, 3)));
      setN(v);
      if (k < 1) raf = requestAnimationFrame(step); else from.current = to;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{n.toLocaleString()}</>;
}

/* Friendly empty-state picture: a card stack with a magnifier and sparkles. */
export function EmptyArt({ size = 132 }: { size?: number }) {
  return (
    <svg className="empty-art" width={size} height={size * 0.8} viewBox="0 0 160 128" aria-hidden>
      <defs>
        <linearGradient id="ea" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#c4b5fd" /><stop offset="1" stopColor="#f0abfc" /></linearGradient>
        <linearGradient id="eb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#67e8f9" /><stop offset="1" stopColor="#8b5cf6" /></linearGradient>
      </defs>
      <rect x="22" y="30" width="96" height="70" rx="14" fill="var(--panel-2)" stroke="var(--line)" transform="rotate(-6 70 65)" />
      <rect x="36" y="22" width="96" height="70" rx="14" fill="var(--panel)" stroke="var(--line)" />
      <circle cx="56" cy="44" r="9" fill="url(#ea)" />
      <rect x="72" y="38" width="44" height="6" rx="3" fill="var(--line)" /><rect x="72" y="49" width="30" height="5" rx="2.5" fill="var(--line)" />
      <rect x="48" y="66" width="70" height="6" rx="3" fill="var(--line)" /><rect x="48" y="77" width="50" height="6" rx="3" fill="var(--line)" />
      <g className="float"><circle cx="122" cy="88" r="16" fill="none" stroke="url(#eb)" strokeWidth="6" /><path d="M134 100l12 12" stroke="url(#eb)" strokeWidth="7" strokeLinecap="round" /></g>
      <path className="twinkle" d="M24 18l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#a78bfa" />
      <path className="twinkle t2" d="M142 26l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" fill="#22d3ee" />
    </svg>
  );
}
