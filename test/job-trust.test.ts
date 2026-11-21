import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessTrust, postingKey, warningSignals, mentions, type TrustReport } from '../src/shared/job-trust';

const job = { url: 'https://example.com/jobs/42', title: 'Sales Manager', company: 'Example Company', snippet: '' };
const unknown: Omit<TrustReport, 'score' | 'state' | 'warnings'> = { checkedAt: '2026-01-01T00:00:00Z', secure: true, listing: 'unknown', titleMatch: false, companyMatch: false, employer: 'not-checked', employerNameMatch: false, listingHost: 'example.com', employerHost: '' };

test('unavailable information stays limited; positive checks are evidence, not a verdict', () => {
  assert.equal(assessTrust(job, unknown).state, 'limited');
  assert.equal(assessTrust(job, { ...unknown, listing: 'closed' }).state, 'closed');
  const r = assessTrust(job, { ...unknown, listing: 'readable', titleMatch: true, companyMatch: true, employer: 'linked', employerNameMatch: true });
  assert.equal(r.score, 100); assert.equal(r.state, 'corroborated');
});

test('exact vacancy comparison keeps identifiers and fragments, only removes tracking parameters', () => {
  assert.equal(postingKey(`${job.url}?utm_source=board`), postingKey(job.url));
  assert.notEqual(postingKey(`${job.url}?id=1`), postingKey(`${job.url}?id=2`));
  assert.notEqual(postingKey(`${job.url}#job-1`), postingKey(`${job.url}#job-2`));
  assert.equal(mentions('A Sales Manager position', job.title), true);
  assert.equal(mentions('A salesperson role', 'Sales'), false);
});

test('warning wording is contextual, bounded and not a fraud verdict', () => {
  assert.deepEqual(warningSignals('Never pay a registration fee. Do not share bank account details.'), []);
  const warnings = warningSignals('Please pay the registration fee. Send your bank account details. Purchase gift cards.');
  assert.deepEqual(warnings.map(r => r.kind), ['fee', 'sensitive', 'payment']);
  assert.equal(assessTrust({ ...job, snippet: 'Please pay a recruitment fee.' }, unknown).state, 'caution');
});
