import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export async function openStore({
  url = process.env.DATABASE_URL,
  file = process.env.SQLITE_FILE || "data/quarrix.sqlite",
} = {}) {
  let run, all, close;
  if (url) {
    const { createPool } = await import("mysql2/promise");
    const pool = createPool({
      uri: url,
      connectionLimit: 5,
      connectTimeout: 10000,
      timezone: "Z",
      multipleStatements: false,
    });
    run = async (sql, args = []) => {
      const [r] = await pool.execute(sql, args);
      return { changes: r.affectedRows };
    };
    all = async (sql, args = []) => {
      const [rows] = await pool.execute(sql, args);
      return rows;
    };
    close = () => pool.end();
  } else {
    if (file !== ":memory:")
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const db = new DatabaseSync(file);
    db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
    run = async (sql, args = []) => db.prepare(sql).run(...args);
    all = async (sql, args = []) => db.prepare(sql).all(...args);
    close = () => db.close();
  }
  try {
    for (const sql of [
      "CREATE TABLE IF NOT EXISTS accounts (id VARCHAR(36) PRIMARY KEY,email VARCHAR(512) NOT NULL,email_digest VARCHAR(64) NOT NULL UNIQUE,password_hash VARCHAR(256) NOT NULL,created BIGINT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS newsletter (owner VARCHAR(36) PRIMARY KEY,subscribed BIGINT NOT NULL,FOREIGN KEY(owner) REFERENCES accounts(id) ON DELETE CASCADE)",
      "CREATE TABLE IF NOT EXISTS verified_accounts (owner VARCHAR(36) PRIMARY KEY,created BIGINT NOT NULL,FOREIGN KEY(owner) REFERENCES accounts(id) ON DELETE CASCADE)",
      "CREATE TABLE IF NOT EXISTS email_tokens (digest VARCHAR(64) PRIMARY KEY,owner VARCHAR(36) NOT NULL,kind VARCHAR(20) NOT NULL,expires BIGINT NOT NULL,FOREIGN KEY(owner) REFERENCES accounts(id) ON DELETE CASCADE)",
      "CREATE TABLE IF NOT EXISTS `usage` (id VARCHAR(100) PRIMARY KEY,n BIGINT NOT NULL,expires BIGINT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS sessions (digest VARCHAR(64) PRIMARY KEY,owner VARCHAR(36) NOT NULL,expires BIGINT NOT NULL,FOREIGN KEY(owner) REFERENCES accounts(id) ON DELETE CASCADE)",
      "CREATE TABLE IF NOT EXISTS suspended (owner VARCHAR(36) PRIMARY KEY,created BIGINT NOT NULL,FOREIGN KEY(owner) REFERENCES accounts(id) ON DELETE CASCADE)",
      "CREATE TABLE IF NOT EXISTS portal_settings (id VARCHAR(40) PRIMARY KEY,value VARCHAR(200) NOT NULL)",
      "CREATE TABLE IF NOT EXISTS admin_audit (id VARCHAR(36) PRIMARY KEY,action VARCHAR(40) NOT NULL,target VARCHAR(100) NOT NULL,created BIGINT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS support_grants (owner VARCHAR(36) PRIMARY KEY,expires BIGINT NOT NULL,FOREIGN KEY(owner) REFERENCES accounts(id) ON DELETE CASCADE)",
      "CREATE TABLE IF NOT EXISTS search_history (id VARCHAR(36) PRIMARY KEY,owner VARCHAR(36) NOT NULL,body TEXT NOT NULL,created BIGINT NOT NULL,FOREIGN KEY(owner) REFERENCES accounts(id) ON DELETE CASCADE)",
      "CREATE TABLE IF NOT EXISTS records (id VARCHAR(36) PRIMARY KEY,owner VARCHAR(36) NOT NULL,kind VARCHAR(32) NOT NULL,body TEXT NOT NULL,updated BIGINT NOT NULL,FOREIGN KEY(owner) REFERENCES accounts(id) ON DELETE CASCADE)",
      "CREATE TABLE IF NOT EXISTS documents (id VARCHAR(36) PRIMARY KEY,owner VARCHAR(36) NOT NULL,name VARCHAR(1024) NOT NULL,mime VARCHAR(80) NOT NULL,bytes BIGINT NOT NULL,content LONGBLOB NOT NULL,FOREIGN KEY(owner) REFERENCES accounts(id) ON DELETE CASCADE)",
    ])
      await run(sql);
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
