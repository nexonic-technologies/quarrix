// Encrypted backups and restore (QF-119). A restore is checked first, then applied at the next start,
// before the database opens, and the current database is kept beside it as a safety copy.
import { app } from 'electron';
import Database from 'better-sqlite3';
import { copyFileSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync,mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import * as db from './db';
import { decryptBackup, encryptBackup } from './backupcrypto';

const dbFile = () => join(app.getPath('userData'), 'quarrix.db');
const pending = () => join(app.getPath('userData'), 'restore-pending.db');
const pendingSettings = () => join(app.getPath('userData'), 'restore-pending-settings.json');
const settingsFile = () => join(app.getPath('userData'), 'settings.json');

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
function validatedBackup(src:string,pass:string){
  const plain = decryptBackup(readFileSync(src), pass);
  if(plain.length<4)throw new Error('Invalid backup bundle.');
  const n = plain.readUInt32BE(0);
  if(n<100||n>plain.length-4)throw new Error('Invalid backup database length.');
  const dbBuf = plain.subarray(4, 4 + n);
  const settings = plain.subarray(4 + n);
  const parsed=JSON.parse(settings.toString('utf8')||'{}');if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Invalid backup settings.');
  const temp=mkdtempSync(join(app.getPath('temp'),'quarrix-restore-check-')),candidate=join(temp,'candidate.db');
  try {
    writeFileSync(candidate,dbBuf);
    const check=new Database(candidate,{readonly:true});
    try{
    const ok = (check.pragma('integrity_check', { simple: true }) as string) === 'ok';
    const hasLeads = !!check.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'leads'").get();
    if (!ok || !hasLeads) throw new Error('The backup decrypted but its database is damaged. Nothing was changed.');
    const leads = (check.prepare('SELECT COUNT(*) n FROM leads').get() as { n: number }).n;
    return { leads,dbBuf,settings:settings.length?settings:Buffer.from('{}') };
    }finally{check.close();}
  }finally{rmSync(temp,{recursive:true,force:true});}
}
/** Check a backup without staging or modifying live data. */
export function inspectBackup(src:string,pass:string){const r=validatedBackup(src,pass);return {leads:r.leads,bytes:r.dbBuf.length};}
export function prepareRestore(src: string, pass: string) {
 const r=validatedBackup(src,pass);
 // Only replace pending data after successful authenticated database and settings validation.
 writeFileSync(pending()+'.tmp',r.dbBuf);writeFileSync(pendingSettings()+'.tmp',r.settings);
 renameSync(pendingSettings()+'.tmp',pendingSettings());renameSync(pending()+'.tmp',pending());
 return {leads:r.leads};
}
export function cancelPendingRestore(){rmSync(pending(),{force:true});rmSync(pendingSettings(),{force:true});}

/** Called before the database opens. */
export function applyPendingRestore() {
  if (!existsSync(pending())) return false;
  if (existsSync(dbFile())) {const safety=join(app.getPath('userData'),`quarrix-before-restore-${Date.now()}.db`);copyFileSync(dbFile(),safety);if(existsSync(dbFile()+'-wal'))copyFileSync(dbFile()+'-wal',safety+'-wal');}
  for (const x of ['-wal', '-shm']) rmSync(dbFile() + x, { force: true });
  renameSync(pending(), dbFile());
  if (existsSync(pendingSettings())) {
    if (existsSync(settingsFile())) copyFileSync(settingsFile(), join(app.getPath('userData'), `settings-before-restore-${Date.now()}.json`));
    renameSync(pendingSettings(), settingsFile());
  }
  return true;
}
