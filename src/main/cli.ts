// Command line and MCP for people who installed the app (no Node.js needed): the app's own binary runs the
// scripts in Node mode (ELECTRON_RUN_AS_NODE=1). "Install the quarrix command" writes a small launcher.
import { app } from 'electron';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const binDir = () => (app.isPackaged ? join(process.resourcesPath, 'app.asar.unpacked', 'bin') : join(app.getAppPath(), 'bin'));
export function info() {
  const exe = process.execPath, cli = join(binDir(), 'quarrix.mjs'), mcp = join(binDir(), 'quarrix-mcp.mjs');
  return {
    cli, mcp,
    mcpConfig: { command: exe, args: [mcp], env: { ELECTRON_RUN_AS_NODE: '1' } },
    run: process.platform === 'win32' ? `set ELECTRON_RUN_AS_NODE=1 && "${exe}" "${cli}" leads` : `ELECTRON_RUN_AS_NODE=1 "${exe}" "${cli}" leads`,
  };
}
export function install() {
  const { cli } = info(), exe = process.execPath;
  if (process.platform === 'win32') {
    const dir = join(process.env.LOCALAPPDATA ?? homedir(), 'Quarrix', 'bin');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'quarrix.cmd');
    writeFileSync(file, `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${exe}" "${cli}" %*\r\n`);
    return { file, hint: `Add ${dir} to your PATH, or run "${file}" directly.` };
  }
  const dir = join(homedir(), '.local', 'bin');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'quarrix');
  writeFileSync(file, `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${exe}" "${cli}" "$@"\n`);
  chmodSync(file, 0o755);
  return { file, hint: `Make sure ${dir} is on your PATH (add  export PATH="$HOME/.local/bin:$PATH"  to ~/.zshrc).` };
}
