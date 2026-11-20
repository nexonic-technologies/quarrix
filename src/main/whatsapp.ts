// WhatsApp, the safe way:
//  - Assisted: opens WhatsApp with the message typed in; the person presses Send. No account risk.
//  - WhatsApp Business Cloud API (official, Meta): for contacts who opted in, and replies within 24 hours.
// Quarrix does not automate a personal WhatsApp account: WhatsApp bans numbers that do that.
import { shell } from 'electron';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { load } from './settings';
import { fetchText } from './util';

export function waNumber(phone: string, country: string) {
  const p = parsePhoneNumberFromString(phone, ((country || load().whatsapp.defaultCountry) || undefined) as CountryCode | undefined);
  return p?.isValid() ? p.number.replace('+', '') : '';
}

export async function openChat(phone: string, country: string, text: string) {
  const n = waNumber(phone, country);
  if (!n) throw new Error('This phone number is not a valid international number.');
  await shell.openExternal(`https://wa.me/${n}?text=${encodeURIComponent(text)}`);
  return n;
}

export async function cloudSend(phone: string, country: string, body: { text?: string; template?: string; language?: string }) {
  const w = load().whatsapp;
  if (!w.cloudToken || !w.phoneNumberId) throw new Error('Add your WhatsApp Business Cloud API token and phone number ID in Settings → WhatsApp.');
  const to = waNumber(phone, country);
  if (!to) throw new Error('This phone number is not a valid international number.');
  const payload = body.template
    ? { messaging_product: 'whatsapp', to, type: 'template', template: { name: body.template, language: { code: body.language || 'en_US' } } }
    : { messaging_product: 'whatsapp', to, type: 'text', text: { body: body.text ?? '' } };
  const r = await fetchText(`https://graph.facebook.com/v21.0/${encodeURIComponent(w.phoneNumberId)}/messages`, {
    method: 'POST', timeout: 30000, headers: { authorization: `Bearer ${w.cloudToken}`, 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  let j: any = {};
  try { j = JSON.parse(r.text || '{}'); } catch { /* not JSON */ }
  if (!r.ok) throw new Error(`WhatsApp refused the message: ${String(j.error?.message ?? `HTTP ${r.status}`).slice(0, 200)}`);
  return j.messages?.[0]?.id ?? '';
}
