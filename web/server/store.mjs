import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { withTimeout } from "./limits.mjs";
const QUERY_TIMEOUT = 10000;

export async function openStore({
  url = process.env.DATABASE_URL,
  file = process.env.SQLITE_FILE || "data/quarrix.sqlite",
} = {}) {
  let run, all, close;
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
    // Every query has a deadline (server-side timeout plus a client-side
    // guard that also covers waiting for a pooled connection).
    const exec = (sql, args) =>
      withTimeout(pool.execute({ sql, timeout: QUERY_TIMEOUT }, args), QUERY_TIMEOUT + 2000, "Database timeout");
    run = async (sql, args = []) => {
      const [r] = await exec(sql, args);
      return { changes: r.affectedRows };
    };
    all = async (sql, args = []) => {
      const [rows] = await exec(sql, args);
      return rows;
    };
    close = () => pool.end();
  } else {
    if (file !== ":memory:")
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const db = new DatabaseSync(file);
    db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    run = async (sql, args = []) => db.prepare(sql).run(...args);
    all = async (sql, args = []) => db.prepare(sql).all(...args);
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
    one: async (sql, args) => (await all(sql, args))[0],
    close,
  };
}
