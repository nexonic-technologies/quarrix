import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
export function localKey() {
  if (process.env.DATA_KEY) {
    const key = Buffer.from(process.env.DATA_KEY, "base64");
    if (key.length !== 32)
      throw Error("DATA_KEY must be 32 random bytes, base64 encoded");
    return key;
  }
  if (process.env.NODE_ENV === "production") throw Error("DATA_KEY required");
  mkdirSync("data", { recursive: true, mode: 0o700 });
  if (!existsSync("data/key"))
    writeFileSync("data/key", randomBytes(32), { mode: 0o600, flag: "wx" });
  return readFileSync("data/key");
}
export function vault(key) {
  if (key.length !== 32) throw Error("Invalid data key");
  return {
    seal(value, aad) {
      const iv = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(aad));
      return Buffer.concat([
        iv,
        cipher.update(value),
        cipher.final(),
        cipher.getAuthTag(),
      ]);
    },
    open(value, aad) {
      const b = Buffer.from(value),
        d = createDecipheriv("aes-256-gcm", key, b.subarray(0, 12));
      d.setAAD(Buffer.from(aad));
      d.setAuthTag(b.subarray(-16));
      return Buffer.concat([d.update(b.subarray(12, -16)), d.final()]);
    },
  };
}
