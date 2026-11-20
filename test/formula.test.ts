import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, evaluate } from '../src/main/formula';
import { osmDetails, schemaDetails, reviewTrend } from '../src/main/intel';

test('formulas compute safely', () => {
  const v = { rating: 3.8, reviews: 120, city: 'Lahore', country: 'PK', name: 'Acme' };
  assert.equal(evaluate('if(rating < 4, "Needs reviews", "Fine")', v), 'Needs reviews');
  assert.equal(evaluate('round(reviews / 12, 1)', v), 10);
  assert.equal(evaluate('concat(city, ", ", country)', v), 'Lahore, PK');
  assert.equal(evaluate('rating >= 3.5 && reviews > 100', v), true);
  assert.equal(evaluate('reviews / 0', v), null);
  assert.equal(evaluate('missing_field', v), null);
  assert.match(String(evaluate('process.exit(1)', v)), /#error/, 'no property access or code');
  assert.match(String(evaluate('constructor("x")', v)), /#error: Unknown function/);
  assert.throws(() => compile('1 +'), /ends too early/);
  assert.throws(() => compile('x'.repeat(600)), /500/);
});

test('business details from OpenStreetMap and websites', () => {
  const d = osmDetails({ opening_hours: 'Mo-Fr 09:00-17:00', wheelchair: 'yes', internet_access: 'wlan', 'payment:cards': 'yes', 'diet:halal': 'yes' });
  assert.equal(d.hours, 'Mo-Fr 09:00-17:00'); assert.equal(d.status, 'operational');
  assert.deepEqual(d.amenities, ['Wheelchair access', 'Wi-Fi', 'Halal']); assert.deepEqual(d.payments, ['cards']);
  assert.equal(osmDetails({ 'disused:shop': 'bakery' }).status, 'closed_permanently');
  const s = schemaDetails([{ '@type': 'Dentist', openingHoursSpecification: [{ dayOfWeek: 'https://schema.org/Monday', opens: '09:00', closes: '17:00' }], priceRange: '$$', foundingDate: '2009', numberOfEmployees: { value: 12 }, logo: 'https://x.com/logo.png' }], '<p>Serving Austin since 2009</p>');
  assert.deepEqual([s.hours, s.price, s.founded, s.employees, s.image], ['Mo 09:00-17:00', '$$', '2009', 12, 'https://x.com/logo.png']);
  const t = reviewTrend([{ at: '2026-01-01', rating: 4.5, reviews: 100 }, { at: '2026-07-01', rating: 4.2, reviews: 160 }])!;
  assert.ok(t.perMonth > 9 && t.perMonth < 11); assert.equal(t.ratingChange, -0.3);
});
