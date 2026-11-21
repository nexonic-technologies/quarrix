import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import * as db from '../../src/main/db';
import { check } from '../../src/main/validate';
import { EMPTY_STUDIO } from '../../src/shared/application-studio';
before(() => db.openDb(join(process.env.QUARRIX_TEST_DIR!, 'v029.db')));
test('studio notes survive ordinary status updates and deletion removes the saved record', () => {
  const id = 'application-test'; db.saveJob({ id, status: 'Saved' } as any);
  const studio = { ...EMPTY_STUDIO, notes: 'Personal notes', resumeDraft: 'My draft', deadline: '2026-12-01' };
  db.saveApplicationStudio(id, studio); db.saveJob({ id, status: 'Applied' } as any);
  assert.deepEqual(db.savedJobs()[0].studio, studio); assert.equal(db.savedJobs()[0].status, 'Applied');
  db.unsaveJob(id); assert.equal(db.savedJobs().length, 0); assert.throws(() => db.saveApplicationStudio(id, studio), /Save the application first/);
});
test('studio fields are bounded and invalid dates rejected', () => {
  assert.throws(() => check('studio:save', ['id', { ...EMPTY_STUDIO, deadline: '2026-02-30' }]), /valid date/);
  assert.throws(() => check('studio:save', ['id', { ...EMPTY_STUDIO, notes: 'x'.repeat(20001) }]), /too long/);
  assert.deepEqual(check('studio:save', ['id', { ...EMPTY_STUDIO, unknown: 'ignored' }]), ['id', EMPTY_STUDIO]);
});
