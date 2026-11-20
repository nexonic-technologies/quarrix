import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanValue, DEFAULT_STAGES } from '../src/main/crm';
import { decryptBackup, encryptBackup } from '../src/main/backupcrypto';

test('custom field values are validated by type', () => {
  assert.equal(cleanValue('number', '42.5'), 42.5);
  assert.throws(() => cleanValue('number', 'abc'), /not a number/);
  assert.equal(cleanValue('date', '2026-11-20'), '2026-11-20');
  assert.throws(() => cleanValue('date', '20/11/2026'), /not a date/);
  assert.equal(cleanValue('url', 'example.com/x'), 'https://example.com/x');
  assert.equal(cleanValue('select', 'Gold', ['Gold', 'Silver']), 'Gold');
  assert.throws(() => cleanValue('select', 'Bronze', ['Gold', 'Silver']), /not one of/);
  assert.equal(cleanValue('text', ''), '');
});

test('default pipeline stages', () => {
  assert.deepEqual(DEFAULT_STAGES.map((s) => s.key), ['lead', 'talking', 'proposal', 'negotiation', 'won', 'lost']);
  assert.equal(DEFAULT_STAGES.find((s) => s.key === 'won')!.probability, 100);
});

test('encrypted backups round-trip and reject a wrong passphrase or tampering', () => {
  const data = Buffer.from('SQLite format 3\u0000 pretend database '.repeat(50));
  const enc = encryptBackup(data, 'correct horse battery');
  assert.ok(!enc.includes(Buffer.from('pretend database')), 'contents are not readable');
  assert.deepEqual(decryptBackup(enc, 'correct horse battery'), data);
  assert.throws(() => decryptBackup(enc, 'wrong passphrase'), /Wrong passphrase/);
  const bad = Buffer.from(enc); bad[bad.length - 1] ^= 1;
  assert.throws(() => decryptBackup(bad, 'correct horse battery'), /Wrong passphrase|damaged/);
  assert.throws(() => decryptBackup(Buffer.from('hello world, not a backup at all, definitely not one'), 'x'.repeat(8)), /not a Quarrix backup/);
  assert.throws(() => encryptBackup(data, 'short'), /at least 8/);
});
