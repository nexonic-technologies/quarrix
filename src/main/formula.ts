// Computed fields (QF-079): a small, safe formula language. No JavaScript runs: the text is parsed into a tree
// and evaluated with a fixed list of operators and functions.
//   if(rating < 4, "Needs reviews", "Fine")     round(reviews / 12, 1)     concat(city, ", ", country)     days_since(created_at)
type Tok = { t: 'num' | 'str' | 'id' | 'op' | 'p' | ','; v: string };
const FUNCS: Record<string, (...a: any[]) => unknown> = {
  if: (c, a, b) => (c ? a : b), round: (x, n = 0) => Math.round(Number(x) * 10 ** Number(n)) / 10 ** Number(n),
  min: (...a) => Math.min(...a.map(Number)), max: (...a) => Math.max(...a.map(Number)), abs: (x) => Math.abs(Number(x)),
  len: (s) => String(s ?? '').length, lower: (s) => String(s ?? '').toLowerCase(), upper: (s) => String(s ?? '').toUpperCase(),
  concat: (...a) => a.map((x) => x ?? '').join(''), contains: (s, x) => String(s ?? '').toLowerCase().includes(String(x ?? '').toLowerCase()),
  empty: (x) => x == null || x === '', days_since: (d) => (d ? Math.floor((Date.now() - Date.parse(String(d))) / 864e5) : null), number: (x) => Number(x) || 0,
};

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) { const m = src.slice(i).match(/^\d*\.?\d+/); if (!m) throw new Error(`Unexpected "${c}" in the formula.`); out.push({ t: 'num', v: m[0] }); i += m[0].length; continue; }
    if (c === '"' || c === "'") { const j = src.indexOf(c, i + 1); if (j < 0) throw new Error('A text value is missing its closing quote.'); out.push({ t: 'str', v: src.slice(i + 1, j) }); i = j + 1; continue; }
    if (/[a-z_]/i.test(c)) { const m = src.slice(i).match(/^[a-z_][a-z0-9_]*/i)!; out.push({ t: 'id', v: m[0] }); i += m[0].length; continue; }
    const two = src.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) { out.push({ t: 'op', v: two }); i += 2; continue; }
    if ('+-*/%<>!'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    if (c === '(' || c === ')') { out.push({ t: 'p', v: c }); i++; continue; }
    if (c === ',') { out.push({ t: ',', v: c }); i++; continue; }
    throw new Error(`Unexpected "${c}" in the formula.`);
  }
  return out;
}

type Node = (vars: Record<string, unknown>) => unknown;
export function compile(src: string): Node {
  if (src.length > 500) throw new Error('Formulas are limited to 500 characters.');
  const toks = lex(src);
  let p = 0;
  const peek = () => toks[p], next = () => toks[p++];
  const expect = (v: string) => { if (peek()?.v !== v) throw new Error(`Expected "${v}" in the formula.`); p++; };
  const bin = (sub: () => Node, ops: string[]) => () => {
    let left = sub();
    while (peek()?.t === 'op' && ops.includes(peek().v)) {
      const op = next().v, l = left, r = sub();
      left = (v) => { const a = l(v) as any, b = r(v) as any;
        switch (op) { case '+': return typeof a === 'string' || typeof b === 'string' ? `${a ?? ''}${b ?? ''}` : Number(a) + Number(b); case '-': return a - b; case '*': return a * b;
          case '/': return Number(b) === 0 ? null : a / b; case '%': return a % b; case '==': return a == b; case '!=': return a != b; // eslint-disable-line eqeqeq
          case '<': return a < b; case '<=': return a <= b; case '>': return a > b; case '>=': return a >= b; case '&&': return a && b; case '||': return a || b; } };
    }
    return left;
  };
  const primary = (): Node => {
    const t = next();
    if (!t) throw new Error('The formula ends too early.');
    if (t.t === 'num') { const n = Number(t.v); return () => n; }
    if (t.t === 'str') return () => t.v;
    if (t.t === 'op' && (t.v === '-' || t.v === '!')) { const e = primary(); return t.v === '-' ? (v) => -(e(v) as number) : (v) => !e(v); }
    if (t.t === 'p' && t.v === '(') { const e = or(); expect(')'); return e; }
    if (t.t === 'id') {
      if (t.v === 'true' || t.v === 'false') return () => t.v === 'true';
      if (peek()?.v === '(') {
        const fn = Object.prototype.hasOwnProperty.call(FUNCS, t.v.toLowerCase()) ? FUNCS[t.v.toLowerCase()] : undefined;
        if (!fn) throw new Error(`Unknown function ${t.v}().`);
        next();
        const args: Node[] = [];
        if (peek()?.v !== ')') { args.push(or()); while (peek()?.t === ',') { next(); args.push(or()); } }
        expect(')');
        if (t.v.toLowerCase() === 'if') return (v) => (args[0](v) ? args[1]?.(v) : args[2]?.(v));
        return (v) => fn(...args.map((a) => a(v)));
      }
      const name = t.v;
      return (v) => (Object.prototype.hasOwnProperty.call(v, name) ? v[name] : null);
    }
    throw new Error(`Unexpected "${t.v}" in the formula.`);
  };
  const mul = bin(primary, ['*', '/', '%']), add = bin(mul, ['+', '-']), cmp = bin(add, ['<', '<=', '>', '>=']), eq = bin(cmp, ['==', '!=']), and = bin(eq, ['&&']), or = bin(and, ['||']);
  const root = or();
  if (p < toks.length) throw new Error(`Unexpected "${toks[p].v}" in the formula.`);
  return root;
}
export function evaluate(src: string, vars: Record<string, unknown>) {
  try { const v = compile(src)(vars); return typeof v === 'number' && !Number.isFinite(v) ? null : v; } catch (e: any) { return `#error: ${e.message}`; }
}
