// Stand-in for the Electron API so main-process modules run under Electron's own Node (ELECTRON_RUN_AS_NODE)
// in integration tests. Real SQLite, real files, real network sockets; only the window system is absent.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = process.env.QUARRIX_TEST_DIR || mkdtempSync(join(tmpdir(), 'quarrix-int-'));
process.env.QUARRIX_TEST_DIR = dir;
export const app = { getPath: (_: string) => dir, getVersion: () => '0.0.0-test', isPackaged: false, getAppPath: () => process.cwd(), getLocale: () => 'en-US', on: () => undefined, relaunch: () => undefined, exit: () => undefined };
// Reversible stand-in for the OS keychain, so encrypted settings round-trip like in the app.
export const safeStorage = { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(`k:${s}`), decryptString: (b: Buffer) => b.toString().slice(2) };
export class BrowserWindow { constructor() { throw new Error('No windows in tests'); } }
export class Notification { constructor(_: unknown) {} show() {} }
export const shell = { openExternal: async () => undefined, showItemInFolder: () => undefined };
export const session = { fromPartition: () => ({}), defaultSession: {} };
export const nativeTheme = { themeSource: 'light', shouldUseDarkColors: false };
export const ipcMain = { handle: () => undefined };
export const dialog = {};
export default { app, safeStorage, BrowserWindow, Notification, shell, session, nativeTheme, ipcMain, dialog };
