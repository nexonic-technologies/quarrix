import { useEffect, useState } from 'react';
import { MapPin, Flag } from 'lucide-react';
import { call } from './api';
import { Combo, type ComboOption } from './Combo';
import { COUNTRIES } from './countries';

const COUNTRY_OPTIONS: ComboOption[] = [{ value: '', label: 'Any country', prefix: '🌐' }, ...COUNTRIES.map(([c, n, f]) => ({ value: c, label: n, prefix: f, hint: c }))];

export function CountryInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <Combo className="country" options={COUNTRY_OPTIONS} value={value} onChange={onChange} placeholder="Any country" icon={<Flag size={16} />} />;
}

/** Type a city, or pick one of the selected country's cities, largest first. */
export function CityInput({ country, value, onChange, onEnter, placeholder }: { country: string; value: string; onChange: (v: string) => void; onEnter?: () => void; placeholder?: string }) {
  const [cities, setCities] = useState<ComboOption[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setCities([]);
    if (!country) return;
    let alive = true;
    setLoading(true);
    call<string[]>('geo:cities', country).then((l) => { if (alive) setCities(l.map((c, i) => ({ value: c, label: c, hint: i < 10 ? 'major city' : undefined }))); }).catch(() => undefined).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [country]);
  const hint = loading ? 'Loading cities…' : country && cities.length ? `Search ${cities.length} cities` : placeholder ?? 'City or area';
  return <Combo className="city" options={cities} value={value} onChange={onChange} placeholder={hint} icon={<MapPin size={16} />} free loading={loading} onEnter={onEnter} />;
}
