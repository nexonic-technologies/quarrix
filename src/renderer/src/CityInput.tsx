import { useEffect, useId, useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { call } from './api';

/** Type a city, or pick one from the selected country's list (loaded on first use, then cached). */
export function CityInput({ country, value, onChange, onEnter, placeholder }: { country: string; value: string; onChange: (v: string) => void; onEnter?: () => void; placeholder?: string }) {
  const id = useId();
  const [cities, setCities] = useState<string[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  useEffect(() => {
    setCities([]);
    if (!country) { setState('idle'); return; }
    let alive = true;
    setState('loading');
    call<string[]>('geo:cities', country).then((l) => { if (alive) { setCities(l); setState('idle'); } }).catch(() => alive && setState('error'));
    return () => { alive = false; };
  }, [country]);
  const hint = state === 'loading' ? 'Loading cities…' : country && cities.length ? `Pick one of ${cities.length} cities, or type` : placeholder ?? 'City or area';
  return (
    <label className="fbox city">
      {state === 'loading' ? <Loader2 size={16} className="spin" /> : <MapPin size={16} />}
      <input list={id} placeholder={hint} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onEnter?.()} />
      <datalist id={id}>{cities.map((c) => <option key={c} value={c} />)}</datalist>
    </label>
  );
}
