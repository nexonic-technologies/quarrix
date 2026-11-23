import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { keyedLock, withTimeout } from "./limits.mjs";
const QUERY_TIMEOUT = 10000;

export async function openStore({
  url = process.env.DATABASE_URL,
  file = process.env.SQLITE_FILE || "data/quarrix.sqlite",
} = {}) {
  let run, all, close, transaction;
  const context = new AsyncLocalStorage();
  if (url) {
    const { createPool } = await import("mysql2/promise");
    const pool = createPool({
      uri: url,
      connectionLimit: 8,
      connectTimeout: 10000,
      waitForConnections: true,
      queueLimit: 200,
      enableKeepAlive: true,
      idleTimeout: 60000,
      timezone: "Z",
      multipleStatements: false,
    });
    // Never allow a request whose acquisition deadline expired to run SQL later.
    async function acquire() {
      const pending = pool.getConnection();
      try { return await withTimeout(pending, QUERY_TIMEOUT, "Database connection timeout"); }
      catch (error) { pending.then(conn => conn.release(), () => {}); throw error; }
    }
    async function execute(conn, sql, args = []) {
      try { return await withTimeout(conn.execute({ sql, timeout: QUERY_TIMEOUT }, args), QUERY_TIMEOUT + 500, "Database timeout"); }
      catch (error) { if (error.timeout || error.code === "PROTOCOL_SEQUENCE_TIMEOUT") conn.destroy(); throw error; }
    }
    // Transaction controls use the text protocol, not prepared statements.
    // START TRANSACTION is not preparable on MySQL 8.4.
    async function control(conn, sql) {
      try { return await withTimeout(conn.query({ sql, timeout: QUERY_TIMEOUT }), QUERY_TIMEOUT + 500, "Database transaction timeout"); }
      catch (error) { if (error.timeout || error.code === "PROTOCOL_SEQUENCE_TIMEOUT") conn.destroy(); throw error; }
    }
    const exec = async (sql, args) => {
      const active = context.getStore();
      if (active) return execute(active, sql, args);
      const conn = await acquire();
      try { return await execute(conn, sql, args); }
      finally { conn.release(); }
    };
    run = async (sql, args = []) => {
      const [r] = await exec(sql, args);
      return { changes: r.affectedRows };
    };
    all = async (sql, args = []) => {
      const [rows] = await exec(sql, args);
      return rows;
    };
    close = () => pool.end();
    transaction = async (fn) => {
      if (context.getStore()) return fn();
      const conn = await acquire();
      try {
        await control(conn, "START TRANSACTION");
        const result = await context.run(conn, fn);
        await control(conn, "COMMIT");
        return result;
      } catch (error) {
        try { await control(conn, "ROLLBACK"); } catch { conn.destroy(); }
        throw error;
      } finally { conn.release(); }
    };
  } else {
    if (file !== ":memory:")
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const db = new DatabaseSync(file);
    db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    const lock = keyedLock();
    const access = fn => context.getStore() ? fn() : lock("sqlite", fn);
    run = async (sql, args = []) => access(() => db.prepare(sql).run(...args));
    all = async (sql, args = []) => access(() => db.prepare(sql).all(...args));
    transaction = fn => context.getStore() ? fn() : lock("sqlite", async () => {
      db.exec("BEGIN IMMEDIATE");
      try { const result = await context.run(true, fn); db.exec("COMMIT"); return result; }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    });
    close = () => db.close();
  }
  try {
    for (const sql of [
      "CREATE TABLE IF NOT EXISTS accounts (id VARCHAR(36) PRIMARY KEY,email VARCHAR(512) NOT NULL,email_digest VARCHAR(64) NOT NULL UNIQUE,password_hash VARCHAR(256) NOT NULL,created BIGINT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS newsletter (owner VARCHAR(36) PRIMARY KEY,subscribed BIGINT NOT NULL,FOREIGN KEY(owner) REFERENCES accounts(id) ON DELETE CASCADE)",
      "CREATE TABLE IF NOT EXISTS privacy_acknowledgements (owner VARCHAR(36) PRIMARY KEY,version VARCHAR(32) NOT NULL,created BIGINT NOT NULL,FOREIGN KEY(owner) REFERENCES accounts(id) ON DELETE CASCADE)",
      "CREATE TABLE IF NOT EXISTS verified_accounts (owner VARCHAR(36) PRIMARY KEY,created BIGINT NOT NULL,FOREIGN KEY(owner) REFERENCES accounts(id) ON DELETE CASCADE)",
      "CREATE TABLE IF NOT EXISTS email_tokens (digest VARCHAR(64) PRIMARY KEY,owner VARCHAR(36) NOT NULL,kind VARCHAR(20) NOT NULL,expires BIGINT NOT NULL,FOREIGN KEY(owner) REFERENCES accounts(id) ON DELETE CASCADE)",
      "CREATE TABLE IF NOT EXISTS `usage` (id VARCHAR(100) PRIMARY KEY,n BIGINT NOT NULL,expires BIGINT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS sessions (digest VARCHAR(64) PRIMARY KEY,owner VARCHAR(36) NOT NULL,expires BIGINT NOT NULL,FOREIGN KEY(owner) REFERENCES accounts(id) ON DELETE CASCADE)",
      "CREATE TABLE IF NOT EXISTS suspended (owner VARCHAR(36) PRIMARY KEY,created BIGINT NOT NULL,FOREIGN KEY(owner) REFERENCES accounts(id) ON DELETE CASCADE)",
      "CREATE TABLE IF NOT EXISTS portal_settings (id VARCHAR(40) PRIMARY KEY,value VARCHAR(200) NOT NULL)",
      "CREATE TABLE IF NOT EXISTS registration_invite_uses (digest VARCHAR(64) PRIMARY KEY,created BIGINT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS admin_audit (id VARCHAR(36) PRIMARY KEY,action VARCHAR(40) NOT NULL,target VARCHAR(100) NOT NULL,created BIGINT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS support_grants (owner VARCHAR(36) PRIMARY KEY,expires BIGINT NOT NULL,FOREIGN KEY(owner) REFERENCES accounts(id) ON DELETE CASCADE)",
      "CREATE TABLE IF NOT EXISTS search_history (id VARCHAR(36) PRIMARY KEY,owner VARCHAR(36) NOT NULL,body TEXT NOT NULL,created BIGINT NOT NULL,FOREIGN KEY(owner) REFERENCES accounts(id) ON DELETE CASCADE)",
      "CREATE TABLE IF NOT EXISTS records (id VARCHAR(36) PRIMARY KEY,owner VARCHAR(36) NOT NULL,kind VARCHAR(32) NOT NULL,body TEXT NOT NULL,updated BIGINT NOT NULL,FOREIGN KEY(owner) REFERENCES accounts(id) ON DELETE CASCADE)",
      "CREATE TABLE IF NOT EXISTS documents (id VARCHAR(36) PRIMARY KEY,owner VARCHAR(36) NOT NULL,name VARCHAR(1024) NOT NULL,mime VARCHAR(80) NOT NULL,bytes BIGINT NOT NULL,content LONGBLOB NOT NULL,FOREIGN KEY(owner) REFERENCES accounts(id) ON DELETE CASCADE)",
    ])
      await run(sql);
    try { await run("INSERT INTO portal_settings(id,value) VALUES('registration-lock','1')"); }
    catch (error) { if (!/unique|duplicate/i.test(error.message)) throw error; }
    // Indexes for the per-owner and expiry lookups used on every request.
    // MySQL has no CREATE INDEX IF NOT EXISTS, so an existing index is ignored.
    for (const [name, table, cols] of [
      ["idx_usage_expires", "`usage`", "expires"],
      ["idx_sessions_owner", "sessions", "owner"],
      ["idx_sessions_expires", "sessions", "expires"],
      ["idx_email_tokens_owner", "email_tokens", "owner"],
      ["idx_records_owner", "records", "owner,updated"],
      ["idx_documents_owner", "documents", "owner"],
      ["idx_history_owner", "search_history", "owner,created"],
      ["idx_history_created", "search_history", "created"],
      ["idx_audit_created", "admin_audit", "created"],
    ])
      try {
        await run(`CREATE INDEX ${name} ON ${table}(${cols})`);
      } catch (error) {
        if (!/exist|duplicate/i.test(error.message)) throw error;
      }
  } catch (error) {
    await close();
    throw error;
  }
  return {
    run,
    all,
    transaction,
    lockAccount: async id => (await all("SELECT id FROM accounts WHERE id=?" + (url ? " FOR UPDATE" : ""), [id]))[0],
    lockRegistration: () => all("SELECT id FROM portal_settings WHERE id='registration-lock'" + (url ? " FOR UPDATE" : "")),
    one: async (sql, args) => (await all(sql, args))[0],
    close,
  };
}
