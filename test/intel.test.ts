import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionLinks, DEFAULT_ICP, detectTech, diffSnapshot, listingUrl, PRESETS, scoreLead, signalConfidence, validSyntax } from '../src/main/intel';

const icp = { ...DEFAULT_ICP, categories: ['Dentists'], countries: ['US'], needs: ['no website', 'slow'], maxReviews: 300 };

test('ideal-customer scoring separates relevance from evidence', () => {
  const good = scoreLead({ category: 'Dentists', country: 'US', website: '', needs: 'no website', reviews: 40, rating: 4.1, phone: '+1 512', provenance: JSON.stringify({ listing: { source: 'gmaps' } }) }, icp);
  const wrongType = scoreLead({ category: 'Bakeries', country: 'US', website: '', needs: 'no website' }, icp);
  const abroad = scoreLead({ category: 'Dentists', country: 'FR', needs: 'slow' }, icp);
  const chain = scoreLead({ category: 'Dentists', country: 'US', tags: 'chain', needs: 'slow' }, { ...icp, excludeChains: true });
  assert.ok(good.relevance > wrongType.relevance && good.relevance > abroad.relevance && good.relevance > chain.relevance);
  assert.ok(good.reasons.why.some((w) => /Needs what you offer/.test(w)));
  assert.ok(wrongType.reasons.against.some((w) => /outside your types/.test(w)));
  assert.equal(abroad.grade === 'A', false);
  // Same lead, more checkable facts → more evidence, same relevance.
  const backed = scoreLead({ category: 'Dentists', country: 'US', website: 'https://x.com', email: 'a@x.com', email_status: 'verified', needs: 'slow', audit: JSON.stringify({ facts: {} }), provenance: JSON.stringify({ listing: { source: 'osm' }, emails: { 'a@x.com': 'https://x.com/contact' } }) }, icp);
  const bare = scoreLead({ category: 'Dentists', country: 'US', website: 'https://x.com', email: 'a@x.com', needs: 'slow' }, icp);
  assert.ok(backed.evidence >= 80 && bare.evidence < 20, `${backed.evidence} vs ${bare.evidence}`);
  assert.ok(['A', 'B', 'C', 'D'].includes(backed.grade));
  assert.ok(Object.keys(PRESETS).length >= 6);
});

test('email syntax', () => {
  for (const ok of ['a@b.co', 'first.last+tag@sub.example.org']) assert.equal(validSyntax(ok), true, ok);
  for (const bad of ['a@b', 'a..b@c.com', '@x.com', 'a@-x.com', 'a b@c.com', 'x@y..com']) assert.equal(validSyntax(bad), false, bad);
});

test('listing links', () => {
  assert.equal(listingUrl('osm', 'node/123'), 'https://www.openstreetmap.org/node/123');
  assert.equal(listingUrl('npi', 'npi:1234567890'), 'https://npiregistry.cms.hhs.gov/provider-view/1234567890');
  assert.equal(listingUrl('wikidata', 'wd:Q95'), 'https://www.wikidata.org/wiki/Q95');
  assert.equal(listingUrl('gmaps', 'https://www.google.com/maps/place/x'), 'https://www.google.com/maps/place/x');
  assert.equal(listingUrl('import', ''), '');
});

test('technology inventory with markers', () => {
  const t = detectTech('<link href="/wp-content/themes/x.css"><script async src="https://www.googletagmanager.com/gtm.js?id=GTM-1"></script><script src="https://js.stripe.com/v3"></script>');
  assert.deepEqual(t.map((x) => x.name).sort(), ['Google Tag Manager', 'Stripe', 'WordPress']);
  assert.ok(t.every((x) => x.marker));
  assert.deepEqual(detectTech('<html>plain</html>'), []);
});

test('booking, menu and ordering links', () => {
  const l = actionLinks([{ href: 'https://x.com/about', text: 'About' }, { href: 'https://calendly.com/x', text: 'Book now' }, { href: 'https://x.com/menu.pdf', text: 'Our Menu' }, { href: 'https://www.doordash.com/store/x', text: 'Delivery' }]);
  assert.deepEqual(l, { booking: 'https://calendly.com/x', menu: 'https://x.com/menu.pdf', order: 'https://www.doordash.com/store/x' });
});

test('snapshot diff and signal confidence', () => {
  assert.deepEqual(diffSnapshot({ rating: 4.5, reviews: 10, phone: '1' }, { rating: 4.1, reviews: 12, phone: '1' }).map((c) => c.field), ['rating', 'reviews']);
  assert.deepEqual(diffSnapshot({ email: null }, { email: '' }), []);
  assert.equal(signalConfidence('ssl'), 'high');
  assert.equal(signalConfidence('hiring', 'We are hiring'), 'low');
  assert.equal(signalConfidence('hiring', 'careers page lists 3 roles'), 'medium');
});
