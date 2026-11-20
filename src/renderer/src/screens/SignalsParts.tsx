import { CATEGORIES } from '../../../shared/categories';

/** Business type with suggestions from the built-in category list. */
export function CategoryInputLite({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <>
      <input className="input" list="qx-cats" placeholder="Business type, e.g. Dentists" value={value} onChange={(e) => onChange(e.target.value)} />
      <datalist id="qx-cats">{CATEGORIES.map((c) => <option key={c.name} value={c.name} />)}</datalist>
    </>
  );
}
