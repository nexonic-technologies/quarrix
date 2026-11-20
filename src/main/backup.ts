// Encrypted backups and restore (QF-119). A restore is checked first, then applied at the next start,
// before the database opens, and the current database is kept beside it as a safety copy.
import { app } from 'electron';
import Database from 'better-sqlite3';
import { copyFileSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as db from './db';
import { decryptBackup, encryptBackup } from './backupcrypto';

const dbFile = () => join(app.getPath('userData'), 'quarrix.db');
const pending = () => join(app.getPath('userData'), 'restore-pending.db');

export async function makeBackup(dest: string, pass: string) {
  const tmp = join(app.getPath('temp'), `quarrix-backup-${Date.now()}.db`);
  await db.raw().backup(tmp);
  try {
    const settings = existsSync(join(app.getPath('userData'), 'settings.json')) ? readFileSync(join(app.getPath('userData'), 'settings.json')) : Buffer.from('{}');
    // Bundle: 4-byte length of the database, the database, then settings (secrets inside stay keychain-encrypted).
    const dbBuf = readFileSync(tmp);
    const head = Buffer.alloc(4); head.writeUInt32BE(dbBuf.length);
    writeFileSync(dest, encryptBackup(Buffer.concat([head, dbBuf, settings]), pass));
    return { bytes: dbBuf.length, path: dest };
  } finally { rmSync(tmp, { force: true }); }
}

/** Decrypt and check a backup; when it is sound, stage it to replace the database at the next start. */
export function prepareRestore(src: string, pass: string) {
  const plain = decryptBackup(readFileSync(src), pass);
  const n = plain.readUInt32BE(0);
  const dbBuf = plain.subarray(4, 4 + n);
  writeFileSync(pending(), dbBuf);
  const check = new Database(pending(), { readonly: true });
  try {
    const ok = (check.pragma('integrity_check', { simple: true }) as string) === 'ok';
    const hasLeads = !!check.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'leads'").get();
    if (!ok || !hasLeads) throw new Error('The backup decrypted but its database is damaged. Nothing was changed.');
    const leads = (check.prepare('SELECT COUNT(*) n FROM leads').get() as { n: number }).n;
    return { leads };
  } catch (e) { check.close(); rmSync(pending(), { force: true }); throw e; }
  finally { if (check.open) check.close(); }
}

/** Called before the database opens. */
export function applyPendingRestore() {
  if (!existsSync(pending())) return false;
  if (existsSync(dbFile())) copyFileSync(dbFile(), join(app.getPath('userData'), `quarrix-before-restore-${Date.now()}.db`));
  for (const x of ['-wal', '-shm']) rmSync(dbFile() + x, { force: true });
  renameSync(pending(), dbFile());
  return true;
}
