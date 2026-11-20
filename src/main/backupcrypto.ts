// Encrypted backup format (QF-119): "QRXB1" + salt(16) + iv(12) + tag(16) + AES-256-GCM(ciphertext).
// The key comes from the user's passphrase with scrypt. Pure Node, no Electron, so it is testable.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const MAGIC = Buffer.from('QRXB1');
const key = (pass: string, salt: Buffer) => scryptSync(pass.normalize('NFKC'), salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

export function encryptBackup(plain: Buffer, pass: string) {
  if (pass.length < 8) throw new Error('Use a passphrase of at least 8 characters.');
  const salt = randomBytes(16), iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(pass, salt), iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), body]);
}

export function decryptBackup(file: Buffer, pass: string) {
  if (file.length < 49 || !file.subarray(0, 5).equals(MAGIC)) throw new Error('This is not a Quarrix backup file.');
  const salt = file.subarray(5, 21), iv = file.subarray(21, 33), tag = file.subarray(33, 49);
  const d = createDecipheriv('aes-256-gcm', key(pass, salt), iv);
  d.setAuthTag(tag);
  try { return Buffer.concat([d.update(file.subarray(49)), d.final()]); } catch { throw new Error('Wrong passphrase, or the backup file is damaged.'); }
}
