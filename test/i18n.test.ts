// QF-123: every interface string is translated into every language, and translations keep placeholders intact.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// @ts-expect-error plain JS helper
import { extract, KEEP } from '../scripts/i18n.mjs';

const LANGS = ['ur', 'ar', 'es', 'fr', 'de'];
const en: string[] = extract();
const cat = (l: string) => JSON.parse(readFileSync(`src/renderer/src/locales/${l}.json`, 'utf8')) as Record<string, string>;

test('every interface string has a translation in every language', () => {
  assert.ok(en.length > 1000, `found ${en.length} strings`);
  for (const l of LANGS) {
    const d = cat(l);
    const missing = en.filter((s) => !d[s] && !KEEP.test(s));
    assert.deepEqual(missing, [], `${l} is missing ${missing.length}: ${missing.slice(0, 5).join(' | ')}`);
  }
});

test('translations are non-empty and keep placeholders, numbers patterns and code', () => {
  for (const l of LANGS) for (const [k, v] of Object.entries(cat(l))) {
    assert.ok(v.trim(), `${l}: empty for ${k}`);
    for (const ph of k.match(/\{[a-z]+\}/g) ?? []) assert.ok(v.includes(ph), `${l}: ${ph} lost in ${k}`);
    if (/(^|\s)#(\s|%|$)/.test(k)) assert.equal((v.match(/#/g) ?? []).length, (k.match(/#/g) ?? []).length, `${l}: # count in ${k}`);
    for (const code of k.match(/[a-z]+\(\)|docs\/[A-Z_]+\.md|https?:\/\/\S+/g) ?? []) assert.ok(v.includes(code.replace(/[.,]$/, '')), `${l}: ${code} lost in ${k}`);
  }
});

test('Arabic and Urdu catalogues are written in their own script', () => {
  for (const l of ['ar', 'ur']) {
    const vals = Object.values(cat(l));
    const native = vals.filter((v) => /[؀-ۿ]/.test(v)).length;
    assert.ok(native / vals.length > 0.9, `${l}: only ${native} of ${vals.length} in Arabic script`);
  }
});
