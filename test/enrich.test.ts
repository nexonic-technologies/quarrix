import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractEmails, rankEmails, siteScore } from '../src/main/enrich';
import { parseJson, templateDraft } from '../src/main/ai';
import { domainOf, isPlatformHost, normalizePhone, csvSafe } from '../src/main/util';

test('finds plain, mailto, obfuscated and Cloudflare-protected emails', () => {
  const key = 0x42;
  const hex = key.toString(16) + [...'hello@site.com'].map((c) => (c.charCodeAt(0) ^ key).toString(16).padStart(2, '0')).join('');
  const html = `<a href="mailto:Info@Site.com">x</a> office [at] site [dot] com <span data-cfemail="${hex}"></span> logo@2x.png`;
  const found = extractEmails(html);
  assert.ok(found.includes('info@site.com'));
  assert.ok(found.includes('office@site.com'));
  assert.ok(found.includes('hello@site.com'));
  assert.ok(!found.some((e) => e.endsWith('.png')));
});

test('ranks business mailboxes first and drops role addresses', () => {
  const r = rankEmails(['noreply@site.com', 'jane@gmail.com', 'info@site.com', 'privacy@site.com', 'sales@site.com'], 'site.com');
  assert.equal(r[0], 'info@site.com');
  assert.ok(!r.includes('noreply@site.com') && !r.includes('privacy@site.com'));
  assert.equal(r.at(-1), 'jane@gmail.com');
});

test('scores websites that need help', () => {
  const base = { url: '', https: true, ms: 500, kb: 50, title: '', description: true, viewport: true, h1: true, platform: '', copyrightYear: 0, booking: true, form: true, analytics: true, schema: true, noSolicit: false };
  assert.equal(siteScore(base).score, 0);
  const bad = siteScore({ ...base, https: false, viewport: false, copyrightYear: 2015 }, { performance: 20, lcp: 8, seo: 60 });
  assert.equal(bad.score, 100);
  assert.ok(bad.findings.length >= 5);
});

test('reads JSON from model replies with extra text', () => {
  assert.deepEqual(parseJson('Sure:\n```json\n{"subject":"hi","body":"x"}\n```'), { subject: 'hi', body: 'x' });
  assert.equal(parseJson('no json here'), null);
});

test('template drafts work without any model', () => {
  const s: any = { profile: { company: 'Acme', name: 'Sam', services: 'We build fast websites. More.' } };
  const lead: any = { name: 'Lakeside Dental', category: 'Dentists', city: 'Austin', domain: 'lakeside.com', audit: JSON.stringify({ findings: ['No HTTPS: browsers mark the site "Not secure".'] }) };
  const d = templateDraft(s, lead, 2);
  assert.match(d.body, /Lakeside Dental/);
  assert.match(d.body, /no https/i);
  assert.equal(d.followups.length, 2);
  assert.doesNotMatch([d.subject, d.body, ...d.followups].join(' '), /\bAI\b|automated|bot\b/i);
});

test('helpers', () => {
  assert.equal(domainOf('https://www.Example.co.uk/path'), 'example.co.uk');
  assert.ok(isPlatformHost('m.facebook.com'));
  assert.equal(normalizePhone('(512) 555-0142', 'US').replace(/\s/g, ''), '+15125550142');
  assert.equal(csvSafe('=HYPERLINK("x")'), `'=HYPERLINK("x")`);
});
