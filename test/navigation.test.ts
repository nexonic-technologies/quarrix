import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveScreen, SCREENS } from '../src/shared/navigation';

test('invalid and accessibility hashes recover to dashboard', () => {
  for (const hash of ['', '#main', '#unknown', '#__proto__']) assert.equal(resolveScreen(hash), 'dashboard');
  for (const screen of SCREENS) assert.equal(resolveScreen('#' + screen), screen);
});
test('restored navigation and workspace switches respect selected mode', () => {
  assert.equal(resolveScreen('#leads', 'career'), 'jobs');
  assert.equal(resolveScreen('#jobradar', 'business'), 'dashboard');
  assert.equal(resolveScreen('#settings', 'career'), 'settings');
  assert.equal(resolveScreen('#jobs', 'both'), 'jobs');
});
