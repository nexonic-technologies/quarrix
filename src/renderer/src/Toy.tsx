// The banner radar as a toy: sweep the pointer across it (or drag) to spin it, faster or slower, and it coasts to a stop.
// Click "Play" for "Catch the signals": tap the blips before they fade, 30 seconds, best score kept on this computer.
import { useEffect, useRef, useState } from 'react';
import { HeroArt } from './Art';
import { Play, X } from 'lucide-react';

type Target = { id: number; x: number; y: number; born: number; life: number; gold: boolean };
const GAME_MS = 30000;
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const best = (k: string) => { try { return Number(localStorage.getItem(`quarrix.best.${k}`)) || 0; } catch { return 0; } };

export function RadarToy({ kind }: { kind: 'leads' | 'jobs' }) {
  const box = useRef<HTMLDivElement>(null);
  const spinner = useRef<HTMLDivElement>(null);
  const st = useRef({ angle: 0, vel: 0, drag: false, last: null as null | { a: number; t: number } });
  const [rpm, setRpm] = useState(0);
  const [game, setGame] = useState<null | { score: number; combo: number; ends: number; over: boolean }>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [hi, setHi] = useState(() => best(kind));
  const [pops, setPops] = useState<{ id: number; x: number; y: number; text: string }[]>([]);
  const seq = useRef(0);

  // Physics loop: angle += velocity, with friction so a flick coasts and slows down.
  useEffect(() => {
    let raf = 0, prev = performance.now(), shown = 0;
    const frame = (t: number) => {
      const dt = Math.min(50, t - prev) / 16.67; prev = t;
      const s = st.current;
      if (!s.drag) { s.angle += s.vel * dt; s.vel *= Math.pow(0.985, dt); if (Math.abs(s.vel) < 0.01) s.vel = 0; }
      if (spinner.current) spinner.current.style.transform = `rotate(${s.angle}deg)`;
      const r = Math.round(Math.abs(s.vel) * 60 * 60 / 360);
      if (r !== shown && (t % 8 < 1 || Math.abs(r - shown) > 3)) { shown = r; setRpm(r); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const angleAt = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
  };
  // Moving across the radar pushes it in the direction of travel, like flicking a spinner.
  const move = (e: React.PointerEvent) => {
    const s = st.current, a = angleAt(e), t = performance.now();
    if (s.last) {
      let d = a - s.last.a; if (d > 180) d -= 360; if (d < -180) d += 360;
      const dt = Math.max(1, t - s.last.t) / 16.67;
      if (s.drag) { s.angle += d; s.vel = d / dt; }
      else if (!reduce()) s.vel = Math.max(-40, Math.min(40, s.vel + (d / dt) * 0.35));
    }
    s.last = { a, t };
  };
  const leave = () => { st.current.last = null; st.current.drag = false; };

  // Game: spawn blips, faster as the score grows; gold ones are worth 3.
  useEffect(() => {
    if (!game || game.over) return;
    const spawn = setInterval(() => {
      const r = 18 + Math.random() * 62, a = Math.random() * Math.PI * 2;
      const life = Math.max(700, 1700 - (game.score * 18));
      setTargets((ts) => [...ts.filter((x) => performance.now() - x.born < x.life), { id: ++seq.current, x: 85 + Math.cos(a) * r, y: 85 + Math.sin(a) * r, born: performance.now(), life, gold: Math.random() < 0.12 }]);
    }, Math.max(380, 750 - game.score * 8));
    const end = setTimeout(() => setGame((g) => (g ? { ...g, over: true } : g)), game.ends - Date.now());
    return () => { clearInterval(spawn); clearTimeout(end); };
  }, [game]);
  useEffect(() => {
    if (!game?.over) return;
    setTargets([]);
    if (game.score > hi) { setHi(game.score); try { localStorage.setItem(`quarrix.best.${kind}`, String(game.score)); } catch { /* storage off */ } }
  }, [game?.over]); // eslint-disable-line react-hooks/exhaustive-deps
  const [, force] = useState(0);
  useEffect(() => { if (!game || game.over) return; const i = setInterval(() => force((n) => n + 1), 250); return () => clearInterval(i); }, [game]);

  const hit = (t: Target, e: React.PointerEvent) => {
    e.stopPropagation();
    setTargets((ts) => ts.filter((x) => x.id !== t.id));
    setGame((g) => {
      if (!g) return g;
      const combo = g.combo + 1, pts = (t.gold ? 3 : 1) * (combo >= 5 ? 2 : 1);
      setPops((p) => [...p.slice(-6), { id: t.id, x: t.x, y: t.y, text: `+${pts}` }]);
      st.current.vel += (Math.random() > 0.5 ? 1 : -1) * 3; // each catch nudges the spin, so it gets harder
      return { ...g, score: g.score + pts, combo };
    });
  };
  const miss = () => setGame((g) => (g && !g.over ? { ...g, combo: 0 } : g));
  const start = (e: React.MouseEvent) => { e.stopPropagation(); setPops([]); setTargets([]); setGame({ score: 0, combo: 0, ends: Date.now() + GAME_MS, over: false }); };
  const left = game && !game.over ? Math.max(0, Math.ceil((game.ends - Date.now()) / 1000)) : 0;

  return (
    <div className={`finder-art toy ${game ? 'playing' : ''}`} ref={box}
      onPointerMove={move} onPointerLeave={leave}
      onPointerDown={(e) => { st.current.drag = true; st.current.last = { a: angleAt(e), t: performance.now() }; (e.target as Element).setPointerCapture?.(e.pointerId); if (game && !game.over) miss(); }}
      onPointerUp={() => { st.current.drag = false; }}
      onWheel={(e) => { st.current.vel = Math.max(-40, Math.min(40, st.current.vel + e.deltaY * 0.02)); }}
      title={game ? undefined : 'Sweep across or drag to spin. Scroll to speed it up.'}>
      <div ref={spinner} className="toy-spin"><HeroArt kind={kind} />
        {targets.map((t) => <button key={t.id} className={`toy-target ${t.gold ? 'gold' : ''}`} style={{ left: t.x, top: t.y, animationDuration: `${t.life}ms` }} onPointerDown={(e) => hit(t, e)} aria-label="Catch" />)}
        {pops.map((p) => <span key={p.id} className="toy-pop" style={{ left: p.x, top: p.y }}>{p.text}</span>)}
      </div>
      {rpm > 2 && !game && <span className="toy-rpm">{rpm} rpm</span>}
      {!game && <button className="toy-play" onClick={start} onPointerDown={(e) => e.stopPropagation()}><Play size={12} /> Play</button>}
      {game && !game.over && <div className="toy-hud"><b>{game.score}</b><span>{left}s{game.combo >= 5 ? ' · ×2' : ''}</span></div>}
      {game?.over && (
        <div className="toy-over" onPointerDown={(e) => e.stopPropagation()}>
          <b>{game.score}</b><span>{game.score >= hi && game.score > 0 ? 'New best!' : `Best ${hi}`}</span>
          <div className="row" style={{ gap: 4 }}><button className="btn small primary" onClick={start}>Again</button><button className="btn small ghost" aria-label="Close game" onClick={(e) => { e.stopPropagation(); setGame(null); }}><X size={12} /></button></div>
        </div>
      )}
    </div>
  );
}
