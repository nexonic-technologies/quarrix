import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, isAbsolute } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
// Owner-configured local scanner only: never send private documents to a third party.
export function localPdfScanner(path = process.env.PDF_SCANNER_PATH) {
  if (!path || !isAbsolute(path)) return null;
  let active = 0;
  return async bytes => {
    if (active >= 2) throw Error("Document scanner busy");
    active++;
    let dir;
    try {
      dir = await mkdtemp(join(tmpdir(), "quarrix-pdf-"));
      const file = join(dir, "document.pdf");
      await writeFile(file, bytes, { mode: 0o600, flag: "wx" });
      try { await exec(path, ["--no-summary", file], { timeout: 15000, maxBuffer: 64000, windowsHide: true }); return true; }
      catch (error) { if (error.code === 1) return false; throw Error("Document scanner unavailable"); }
    } finally { active--; if (dir) await rm(dir, { recursive: true, force: true }); }
  };
}
