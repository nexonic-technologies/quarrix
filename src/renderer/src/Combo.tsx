import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Check, Loader2 } from 'lucide-react';

export type ComboOption = { value: string; label: string; prefix?: string; hint?: string };
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** A themed, type-to-filter dropdown. With `free`, anything typed is accepted (for cities). */
export function Combo({ options, value, onChange, placeholder, icon, free, typed, loading, onEnter, className = '' }: {
  options: ComboOption[]; value: string; onChange: (v: string) => void; placeholder: string; icon: React.ReactNode;
  /** With `typed`, Enter keeps what was typed unless a suggestion was chosen with the arrow keys. */
  free?: boolean; typed?: boolean; loading?: boolean; onEnter?: () => void; className?: string;
}) {
  const selected = options.find((o) => o.value === value);
  const [text, setText] = useState(free ? value : selected?.label ?? '');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [moved, setMoved] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!open) setText(free ? value : selected?.label ?? ''); }, [value, selected, open, free]);
  useEffect(() => { const f = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); }; addEventListener('mousedown', f); return () => removeEventListener('mousedown', f); }, []);

  const shown = useMemo(() => {
    const q = norm(text.trim());
    if (!q || (!free && text === selected?.label)) return options.slice(0, 300);
    const starts = options.filter((o) => norm(o.label).startsWith(q));
    const words = options.filter((o) => !starts.includes(o) && norm(o.label).split(/[\s,-]+/).some((w) => w.startsWith(q)));
    const has = q.length > 1 ? options.filter((o) => o.value && !starts.includes(o) && !words.includes(o) && norm(o.label).includes(q)) : [];
    return [...starts, ...words, ...has].slice(0, 300);
  }, [text, options, free, selected]);
  useEffect(() => { list.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' }); }, [hi, open]);

  const pick = (o: ComboOption) => { onChange(o.value); setText(o.label); setOpen(false); };
  return (
    <div className={`fbox combo ${open ? 'open' : ''} ${className}`} ref={box} onClick={() => { input.current?.focus(); setOpen(true); }}>
      {loading ? <Loader2 size={16} className="spin" /> : icon}
      {selected?.prefix && !open && <span className="combo-prefix">{selected.prefix}</span>}
      <input ref={input} value={text} placeholder={placeholder}
        onFocus={(e) => { setOpen(true); setHi(0); e.currentTarget.select(); }}
        onChange={(e) => { setText(e.target.value); setOpen(true); setHi(0); setMoved(false); if (free) onChange(e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setMoved(true); setHi((h) => Math.min(h + 1, shown.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); if (open && shown[hi] && (!typed || moved)) pick(shown[hi]); else { setOpen(false); onEnter?.(); } setMoved(false); }
          else if (e.key === 'Escape') { setOpen(false); input.current?.blur(); }
          else if (e.key === 'Tab') setOpen(false);
        }} />
      {value && !free && <button className="combo-clear" aria-label="Clear" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onChange(''); setText(''); }}>×</button>}
      <ChevronDown size={15} className="combo-caret" />
      {open && shown.length > 0 && (
        <div className="combo-menu" ref={list} role="listbox">
          {shown.map((o, i) => (
            <button key={o.value + i} type="button" role="option" aria-selected={o.value === value} className={`${i === hi ? 'on' : ''} ${o.value === value ? 'sel' : ''}`}
              onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); pick(o); }}>
              {o.prefix && <span className="combo-prefix">{o.prefix}</span>}
              <span className="grow">{o.label}</span>
              {o.hint && <em>{o.hint}</em>}
              {o.value === value && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
      {open && !shown.length && free && text && <div className="combo-menu empty">Press Enter to use "{text}"</div>}
    </div>
  );
}
