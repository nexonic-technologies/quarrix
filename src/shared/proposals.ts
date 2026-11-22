import { validDay } from './application-studio';
export type Proposal = { title: string; provider: string; scope: string; deliverables: string; terms: string; currency: string; status: 'Draft' | 'Sent' | 'Accepted' | 'Declined'; items: { description: string; quantity: number; unitMinor: number }[]; validUntil?:string; discountBps?:number };
export const EMPTY_PROPOSAL: Proposal = { title: '', provider: '', scope: '', deliverables: '', terms: '', currency: 'USD', status: 'Draft', items: [] };
export const PROPOSAL_TEMPLATES = {
  consulting: { title:'Consulting proposal', scope:'Describe the goals, current situation and agreed scope.', deliverables:'List the agreed assessment, recommendations and written deliverables.', terms:'Confirm timeline, acceptance criteria, payment terms and exclusions.' },
  implementation: { title:'Implementation proposal', scope:'Describe the requirements, dependencies and implementation boundaries.', deliverables:'List milestones, deliverables, handover and acceptance criteria.', terms:'Confirm delivery schedule, revisions, payment terms and exclusions.' },
  support: { title:'Ongoing support proposal', scope:'Describe supported services and the support period.', deliverables:'List support activities, reporting and response expectations.', terms:'Confirm renewal terms, limits, payment and responsibilities.' },
} as const;
export const proposalSubtotal = (p: Proposal) => p.items.reduce((n, i) => n + i.quantity * i.unitMinor, 0);
export const proposalTotal = (p: Proposal) => {const subtotal=proposalSubtotal(p),bps=p.discountBps??0;const discount=Math.floor(subtotal/10000)*bps+Math.round((subtotal%10000)*bps/10000);return subtotal-discount;};
export function validateProposal(value: unknown): Proposal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid proposal.');
  const v = value as Record<string, unknown>;
  const text = (x: unknown, limit: number) => { if (typeof x !== 'string' || x.length > limit) throw new Error('Invalid proposal text.'); return x; };
  if (!['USD','PKR','EUR','GBP','CAD','AUD','AED','SAR'].includes(String(v.currency))) throw new Error('Unsupported quotation currency.');
  if (!['Draft','Sent','Accepted','Declined'].includes(String(v.status))) throw new Error('Invalid proposal status.');
  if (!Array.isArray(v.items) || v.items.length > 30) throw new Error('Too many quotation items.');
  const items = v.items.map((i: any) => { if (!i || !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 10000 || !Number.isSafeInteger(i.unitMinor) || i.unitMinor < 0 || i.unitMinor > 100000000) throw new Error('Invalid quotation amount.'); return { description: text(i.description, 300), quantity: i.quantity, unitMinor: i.unitMinor }; });
  const validUntil=v.validUntil==null?'':text(v.validUntil,10),discountBps=v.discountBps??0;
  if(!validDay(validUntil)||typeof discountBps!=='number'||!Number.isInteger(discountBps)||discountBps<0||discountBps>10000)throw new Error('Invalid proposal validity or discount.');
  return { title: text(v.title, 200), provider: text(v.provider, 200), scope: text(v.scope, 10000), deliverables: text(v.deliverables, 10000), terms: text(v.terms, 10000), currency: String(v.currency), status: v.status as Proposal['status'], items,...(validUntil?{validUntil}:{}),...(discountBps?{discountBps}:{}) };
}
export function proposalText(p: Proposal, customer: string): string {
  const money = (n: number) => `${p.currency} ${(n / 100).toFixed(2)}`;
  return [p.title || 'Business proposal', `Prepared for: ${customer}`, `Prepared by: ${p.provider || '—'}`, `Status: ${p.status}`, ...(p.validUntil?[`Valid until: ${p.validUntil}`]:[]), '', 'SCOPE', p.scope || '—', '', 'DELIVERABLES', p.deliverables || '—', '', 'QUOTATION', ...p.items.map(i => `${i.description || 'Item'} · ${i.quantity} × ${money(i.unitMinor)} = ${money(i.quantity * i.unitMinor)}`), ...(p.discountBps?[`Subtotal: ${money(proposalSubtotal(p))}`,`Discount: ${(p.discountBps/100).toFixed(2)}%`]:[]), `Total: ${money(proposalTotal(p))}`, '', 'TERMS', p.terms || '—', '', 'Review and confirm all scope, pricing and terms before sending.'].join('\n');
}
export function documentHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>@page{size:A4;margin:18mm}body{font:14px Arial,sans-serif;color:#18243a}h1{font-size:24px;color:#512da8;border-bottom:2px solid #7c3aed;padding-bottom:12px}p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6;margin:7px 0}</style></head><body>${text.split('\n').map((s,i)=>i===0?`<h1>${esc(s)}</h1>`:`<p>${esc(s)}</p>`).join('')}</body></html>`;
}
