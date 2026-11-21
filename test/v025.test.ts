import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sameBusiness, differentPlace } from '../src/main/safety';
import { isQuotaError } from '../src/main/ai';

test('branches sharing a phone or domain are not merged', () => {
  const a = { name: 'Subway', phone: '+1 800 555 0100', domain: 'subway.com', city: 'Austin', address: '1 Main St' };
  assert.equal(sameBusiness(a, { ...a, address: '99 Oak Ave' }), false); // central phone, other branch
  assert.equal(sameBusiness(a, { ...a, city: 'Dallas', address: '' }), false);
  assert.equal(sameBusiness({ ...a, address: '', lat: 30.26, lon: -97.74 }, { ...a, address: '', lat: 30.30, lon: -97.70 }), false); // 5 km apart
  assert.equal(sameBusiness({ ...a, address: '', lat: 30.26, lon: -97.74 }, { ...a, address: '', lat: 30.2601, lon: -97.7401 }), true);
  assert.equal(sameBusiness(a, { ...a }), true);
  assert.equal(differentPlace({ city: 'Austin' }, { city: 'austin ' }), false);
});

test('timeouts, resets and empty answers also move to the next model', () => {
  for (const m of ['This operation was aborted', 'Request timed out', 'socket hang up', 'fetch failed', 'The model sent an empty answer.']) assert.ok(isQuotaError(new Error(m)), m);
  assert.ok(!isQuotaError(new Error('Your prompt is too long')));
});

test('browser extension asks only for the active tab and this computer', () => {
  const m = JSON.parse(readFileSync('extension/manifest.json', 'utf8'));
  assert.equal(m.manifest_version, 3);
  assert.deepEqual(m.permissions.sort(), ['activeTab', 'storage']);
  assert.deepEqual(m.host_permissions, ['http://127.0.0.1/*']);
  const popup = readFileSync('extension/popup.js', 'utf8');
  assert.match(popup, /\/v1\/capture/); assert.match(popup, /Authorization|token/i);
  assert.doesNotMatch(popup, /https?:\/\/(?!127\.0\.0\.1)[a-z]/i);
});
