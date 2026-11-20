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

/* Hero art for the search banners: a radar around the Nexonic mark, with leads or jobs orbiting and popping in. */
import { Building2 as IBuilding, Mail as IMail, MapPin as IPin, Globe as IGlobe, Briefcase as IBag, FileText as IDoc, BadgeCheck as ICheck, Star as IStar } from 'lucide-react';
import { NEXONIC_LOGO } from './brand';
export function HeroArt({ kind = 'leads' }: { kind?: 'leads' | 'jobs' }) {
  const icons = kind === 'leads' ? [IBuilding, IMail, IPin, IGlobe] : [IBag, IDoc, ICheck, IStar];
  return (
    <div className={`hero-art ${kind}`} aria-hidden>
      <div className="ring r1" /><div className="ring r2" /><div className="ring r3" />
      <div className="sweep" />
      <div className="core"><img src={NEXONIC_LOGO} alt="" /></div>
      {icons.map((I, i) => <span key={i} className={`orbit ob${i}`}><span className="bubble"><I size={15} /></span></span>)}
      {Array.from({ length: 6 }, (_, i) => <i key={i} className="blip" style={{ ['--i' as string]: i }} />)}
    </div>
  );
}

/** Animated banner background with a soft light that follows the mouse. */
export function HeroBg({ kind, mode }: { kind: 'leads' | 'jobs'; mode: SceneMode }) {
  return <div className="hero-bg" aria-hidden><i /><i /><i /><HeroScene kind={kind} mode={mode} /><b className="spot" /></div>;
}

/** idle / focus / busy, plus a short "done" after busy ends. */
export function useSceneMode(busy: boolean, focused: boolean): SceneMode {
  const [done, setDone] = useState(false);
  const was = useRef(busy);
  useEffect(() => {
    if (was.current && !busy) { setDone(true); const t = setTimeout(() => setDone(false), 2500); was.current = busy; return () => clearTimeout(t); }
    was.current = busy;
  }, [busy]);
  return busy ? 'busy' : done ? 'done' : focused ? 'focus' : 'idle';
}
export const spotlight = (e: React.MouseEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
};

/* Full-banner animated scene that reacts to what the person is doing.
   leads: a network of businesses, pins light up where the scan passes.
   jobs: job cards drift up, matching ones get a tick.
   mode: idle (calm), focus (typing), busy (searching: new colour, scan beam, faster), done (short burst). */
export type SceneMode = 'idle' | 'focus' | 'busy' | 'done';
const PALETTE: Record<string, Record<SceneMode, [number, number, number]>> = {
  leads: { idle: [124, 58, 237], focus: [79, 70, 229], busy: [16, 185, 129], done: [236, 72, 153] },
  jobs: { idle: [124, 58, 237], focus: [8, 145, 178], busy: [245, 158, 11], done: [236, 72, 153] },
};
export function HeroScene({ kind, mode }: { kind: 'leads' | 'jobs'; mode: SceneMode }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, raf = 0, t = 0, beam = -0.2, lastMode: SceneMode = 'idle', burstAt = -1;
    const mouse = { x: -999, y: -999 };
    const col = [...PALETTE[kind].idle];
    type P = { x: number; y: number; vx: number; vy: number; r: number; pin: number; tick: number };
    let ps: P[] = [];
    const spawn = (y?: number): P => ({ x: Math.random() * w, y: y ?? Math.random() * h, vx: (Math.random() - 0.5) * 0.25, vy: kind === 'jobs' ? -(0.15 + Math.random() * 0.25) : (Math.random() - 0.5) * 0.25, r: 1 + Math.random() * 1.6, pin: 0, tick: 0 });
    const fit = () => {
      const dpr = devicePixelRatio || 1;
      const r = cv.parentElement!.getBoundingClientRect();
      w = r.width; h = r.height;
      cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round((w * h) / (kind === 'leads' ? 9000 : 16000));
      ps = Array.from({ length: n }, () => spawn());
    };
    const ro = new ResizeObserver(fit); ro.observe(cv.parentElement!); fit();
    const host = (cv.closest('.finder') as HTMLElement) ?? cv.parentElement!;
    const mv = (e: MouseEvent) => { const r = cv.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; };
    const out = () => { mouse.x = mouse.y = -999; };
    host.addEventListener('mousemove', mv); host.addEventListener('mouseleave', out);
    const rgba = (a: number) => `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${a})`;
    const card = (x: number, y: number, s: number, a: number, tick: boolean) => {
      ctx.fillStyle = `rgba(255,255,255,${0.55 * a})`; ctx.strokeStyle = rgba(0.35 * a); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(x - 11 * s, y - 7 * s, 22 * s, 14 * s, 3 * s); ctx.fill(); ctx.stroke();
      ctx.fillStyle = rgba(0.5 * a); ctx.fillRect(x - 7 * s, y - 3 * s, 10 * s, 1.6 * s); ctx.fillRect(x - 7 * s, y + 1 * s, 14 * s, 1.4 * s);
      if (tick) { ctx.strokeStyle = rgba(0.95 * a); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x + 5 * s, y - 1 * s); ctx.lineTo(x + 7 * s, y + 2 * s); ctx.lineTo(x + 11 * s, y - 5 * s); ctx.stroke(); }
    };
    const frame = () => {
      const m = modeRef.current;
      if (m !== lastMode) { if (m === 'done') burstAt = t; lastMode = m; }
      const target = PALETTE[kind][m];
      for (let i = 0; i < 3; i++) col[i] += (target[i] - col[i]) * 0.05;
      const speed = m === 'busy' ? 3.2 : m === 'focus' ? 1.6 : 1;
      t += 1;
      ctx.clearRect(0, 0, w, h);
      // scan beam sweeping the whole banner while busy
      if (m === 'busy') {
        beam += 0.006;
        if (beam > 1.2) beam = -0.2;
        const bx = beam * w;
        const g = ctx.createLinearGradient(bx - 140, 0, bx + 16, 0);
        g.addColorStop(0, rgba(0)); g.addColorStop(0.82, rgba(0.14)); g.addColorStop(0.94, rgba(0.38)); g.addColorStop(1, rgba(0));
        ctx.fillStyle = g; ctx.fillRect(bx - 140, 0, 156, h);
      }
      for (const p of ps) {
        p.x += p.vx * speed; p.y += p.vy * speed;
        const dx = p.x - mouse.x, dy = p.y - mouse.y, d = Math.hypot(dx, dy);
        if (d < 90 && d > 0) { p.x += (dx / d) * 0.8; p.y += (dy / d) * 0.8; }
        if (kind === 'jobs' && p.y < -20) Object.assign(p, spawn(h + 10));
        if (p.x < -20) p.x = w + 20; if (p.x > w + 20) p.x = -20;
        if (kind === 'leads') { if (p.y < -20) p.y = h + 20; if (p.y > h + 20) p.y = -20; }
        if (m === 'busy' && Math.abs(p.x - beam * w) < 3 && Math.random() < 0.5) { p.pin = 1; p.tick = 1; }
        else if (m !== 'busy' && Math.random() < (m === 'focus' ? 0.002 : 0.0006)) p.pin = 1;
        p.pin *= 0.985;
      }
      if (kind === 'leads') {
        ctx.lineWidth = 1;
        for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
          const a = ps[i], b = ps[j], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 95) { ctx.strokeStyle = rgba((1 - d / 95) * (m === 'busy' ? 0.3 : 0.16)); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
        }
        for (const p of ps) {
          const dm = Math.hypot(p.x - mouse.x, p.y - mouse.y);
          if (dm < 140) { ctx.strokeStyle = rgba((1 - dm / 140) * 0.45); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke(); }
          ctx.fillStyle = rgba(0.55); ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
          if (p.pin > 0.05) {
            ctx.strokeStyle = rgba(p.pin * 0.7); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(p.x, p.y, 3 + (1 - p.pin) * 14, 0, 7); ctx.stroke();
            ctx.fillStyle = rgba(p.pin); ctx.beginPath(); ctx.arc(p.x, p.y - 7, 3.2, 0, 7); ctx.fill();
            ctx.beginPath(); ctx.moveTo(p.x - 2.6, p.y - 5.5); ctx.lineTo(p.x, p.y - 1); ctx.lineTo(p.x + 2.6, p.y - 5.5); ctx.fill();
          }
        }
      } else {
        for (const p of ps) {
          const near = Math.hypot(p.x - mouse.x, p.y - mouse.y) < 110;
          card(p.x, p.y, 0.7 + p.r * 0.25, near ? 1 : 0.75, p.tick > 0.2 || (near && m !== 'idle'));
          p.tick *= 0.996;
        }
      }
      // short celebration when a search finishes
      if (burstAt >= 0 && t - burstAt < 90) {
        const k = (t - burstAt) / 90;
        for (let i = 0; i < 26; i++) {
          const a = (i / 26) * Math.PI * 2, rr = k * Math.min(w, h) * 0.6;
          ctx.fillStyle = rgba(1 - k); ctx.beginPath(); ctx.arc(w * 0.82 + Math.cos(a) * rr, h * 0.5 + Math.sin(a) * rr, 2.2, 0, 7); ctx.fill();
        }
      }
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    frame();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); host.removeEventListener('mousemove', mv); host.removeEventListener('mouseleave', out); };
  }, [kind]);
  return <canvas ref={ref} className="hero-scene" aria-hidden />;
}

/* Animated type: words rise in one after another; a rotating word swaps with a slide. */
export function RiseText({ text, as: Tag = 'span', className = '' }: { text: string; as?: 'span' | 'h1' | 'h2' | 'p'; className?: string }) {
  return (
    <Tag className={`rise ${className}`} key={text} aria-label={text}>
      {text.split(' ').map((w, i) => <span key={i} aria-hidden style={{ animationDelay: `${i * 45}ms` }}>{w}&nbsp;</span>)}
    </Tag>
  );
}
export function RotatingWord({ words, ms = 2400 }: { words: string[]; ms?: number }) {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((n) => (n + 1) % words.length), ms); return () => clearInterval(t); }, [words.length, ms]);
  return (
    <span className="rotor" aria-live="off">
      <span key={i} className="rotor-word">{words[i]}</span>
    </span>
  );
}
