import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkJobTrust } from '../../src/main/job-trust';
import { check } from '../../src/main/validate';

const job = { url: 'https://example.com/jobs/42', title: 'Sales Manager', company: 'Example Company', snippet: 'A full-time sales role.' };
const employerUrl = 'https://example.org/careers';
const html = (s: string, status = 200) => new Response(s, { status, headers: { 'content-type': 'text/html' } });
const listing = '<html><main>Example Company is hiring a Sales Manager. The full-time position manages a team, develops customer relationships and supports regional sales.</main></html>';

test('job trust corroborates a matching listing only when the employer page names the company and links the exact vacancy', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (async (url: string) => url.includes('example.com') ? html(listing) : html(`<title>Example Company careers</title><a href="${job.url}">Sales Manager</a>`)) as typeof fetch;
    const r = await checkJobTrust(job, employerUrl);
    assert.equal(r.listing, 'readable'); assert.equal(r.employer, 'linked'); assert.equal(r.employerNameMatch, true); assert.equal(r.state, 'corroborated');
    globalThis.fetch = (async (url: string) => url.includes('example.com') ? html(listing) : html('<title>Example Company careers</title><a href="https://example.com/jobs/43">Other position</a>')) as typeof fetch;
    const other = await checkJobTrust(job, employerUrl);
    assert.equal(other.employer, 'not-linked'); assert.equal(other.state, 'limited');
  } finally { globalThis.fetch = original; }
});

test('closed, blocked and failed requests are reported accurately', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (async () => html('Gone', 410)) as typeof fetch;
    assert.equal((await checkJobTrust(job)).state, 'closed');
    globalThis.fetch = (async () => html('Access denied', 403)) as typeof fetch;
    assert.equal((await checkJobTrust(job)).state, 'limited');
    globalThis.fetch = (async () => { throw new Error('Offline'); }) as typeof fetch;
    assert.equal((await checkJobTrust(job)).listing, 'unknown');
  } finally { globalThis.fetch = original; }
});

test('trust request fields are bounded and restricted to the required job data', () => {
  const [parsed, site] = check('jobs:trust', [{ ...job, unrelated: 'ignored' }, employerUrl]);
  assert.deepEqual(parsed, job); assert.equal(site, employerUrl);
  assert.throws(() => check('jobs:trust', [{ ...job, title: 'x'.repeat(301) }, employerUrl]), /too long/);
});
