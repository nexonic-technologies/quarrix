import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../server/store.mjs";
import { createApp } from "../server/app.mjs";
import { match, inRegion } from "../server/discovery.mjs";

const HOST = "quarrix.example.test";
const ORIGIN = "https://" + HOST;

async function start(t, { search, env = {}, dist, scanPdf } = {}) {
  const keys = { TURNSTILE_SITE_KEY: "site", TURNSTILE_SECRET: "secret", TURNSTILE_HOSTNAMES: HOST, ALLOW_REGISTRATION: "true", ...env };
  const previous = Object.fromEntries(Object.keys(keys).map((k) => [k, process.env[k]]));
  Object.assign(process.env, keys);
  const store = await openStore({ url: "", file: ":memory:" });
  const sent = [];
  const app = createApp(store, {
    production: true,
    origin: ORIGIN,
    dataKey: randomBytes(32),
    dist,
    scanPdf,
    sendMail: async (email, kind, token) => sent.push({ email, kind, token }),
    search: search || (async () => ({ rows: [], status: "live", checkedAt: Date.now() })),
    // A token is valid when it equals "ok:<action>".
    turnstileRequest: async (_url, options) => {
      const token = options.body.get("response");
      const ok = token.startsWith("ok:");
      return { ok: true, json: async () => ({ success: ok, hostname: HOST, action: token.slice(3) }) };
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    for (const [k, v] of Object.entries(previous)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    await new Promise((r) => server.close(r));
    await store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, body, cookie = "") => {
    const r = await fetch(base + "/api/" + path, {
      method: "POST",
      headers: { Origin: ORIGIN, "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
    });
    return { status: r.status, data: await r.json(), cookie: r.headers.getSetCookie().map((x) => x.split(";")[0]).join("; ") };
  };
  return { base, post, store, sent };
}

test("database transactions roll back coupled writes on failure", async (t) => {
  const store = await openStore({ file: ":memory:" });
  t.after(() => store.close());
  await assert.rejects(store.transaction(async () => {
    await store.run("INSERT INTO portal_settings(id,value) VALUES(?,?)", ["test-rollback", "1"]);
    throw Error("simulated failure");
  }), /simulated failure/);
  assert.equal(await store.one("SELECT id FROM portal_settings WHERE id=?", ["test-rollback"]), undefined);
});

test("password reset rolls back when session revocation fails", async t => {
  const { post, sent, store } = await start(t);
  const account = { email: "rollback@example.test", password: "a perfectly fine password", privacyAccepted: true };
  assert.equal((await post("register", { ...account, "cf-turnstile-response": "ok:signup" })).status, 202);
  assert.equal((await post("email-complete", { kind: "verify", token: sent[0].token })).status, 200);
  await post("email-request", { email: account.email, kind: "reset", "cf-turnstile-response": "ok:recovery" });
  const reset = { kind: "reset", token: sent.at(-1).token, password: "a totally new password" };
  const run = store.run;
  store.run = async (sql, args) => { if (sql === "DELETE FROM sessions WHERE owner=?") throw Error("simulated database failure"); return run(sql, args); };
  assert.equal((await post("email-complete", reset)).status, 500);
  store.run = run;
  assert.equal((await post("login", { ...account, "cf-turnstile-response": "ok:login" })).status, 200);
  assert.equal((await post("email-complete", reset)).status, 200);
  assert.equal((await post("login", { ...account, password: reset.password, "cf-turnstile-response": "ok:login" })).status, 200);
});

test("production document uploads and downloads fail closed without a clean screening result", async t => {
  let verdict = false;
  const adminToken = randomBytes(32).toString("hex");
  const { base, post, sent, store } = await start(t, { env: { ADMIN_TOKEN: adminToken }, scanPdf: async () => { if (verdict === null) throw Error("scanner offline"); return verdict; } });
  const account = { email: "upload@example.test", password: "a perfectly fine password", privacyAccepted: true };
  await post("register", { ...account, "cf-turnstile-response": "ok:signup" });
  await post("email-complete", { kind: "verify", token: sent[0].token });
  const login = await post("login", { ...account, "cf-turnstile-response": "ok:login" });
  const body = { name: "document.pdf", content: Buffer.from("%PDF-1.7\nfixture").toString("base64") };
  assert.equal((await post("workspace/documents", body, login.cookie)).status, 422);
  verdict = null;
  assert.equal((await post("workspace/documents", body, login.cookie)).status, 503);
  assert.equal(Number((await store.one("SELECT COUNT(*) AS n FROM documents")).n), 0);
  verdict = true;
  const uploaded = await post("workspace/documents", body, login.cookie);
  assert.equal(uploaded.status, 201);
  const id = uploaded.data.id;
  const owner = login.data.user.id;
  const download = () => fetch(base + "/api/workspace/documents/" + id, { headers: { Cookie: login.cookie } });
  const support = () => fetch(base + "/api/admin/support/" + owner + "/document/" + id, { headers: { Authorization: "Bearer " + adminToken } });
  assert.equal((await support()).status, 403);
  await store.run("INSERT INTO support_grants(owner,expires) VALUES(?,?)", [owner, Date.now() + 60000]);
  verdict = false;
  assert.equal((await download()).status, 422);
  assert.equal((await support()).status, 422);
  verdict = null;
  assert.equal((await download()).status, 503);
  assert.equal((await support()).status, 503);
  assert.equal(Number((await store.one("SELECT COUNT(*) AS n FROM documents")).n), 1);
  verdict = true;
  assert.equal((await download()).status, 200);
  assert.equal((await support()).status, 200);
});

test("unverified junk traffic cannot lock other people out", async (t) => {
  const { post, sent } = await start(t);
  const account = { email: "victim@example.test", password: "a perfectly fine password", privacyAccepted: true };
  assert.equal((await post("register", { ...account, "cf-turnstile-response": "ok:signup" })).status, 202);
  assert.equal((await post("email-complete", { kind: "verify", token: sent[0].token })).status, 200);
  // An attacker floods every public form without solving the security check.
  for (let i = 0; i < 200; i++) {
    await post("login", { email: "x@y.z", password: "nope" });
    await post("register", { email: `x${i}@y.z`, password: "nope nope nope", privacyAccepted: true });
    await post("email-request", { email: "x@y.z", kind: "reset" });
    await post("discover", { kind: "jobs", q: "x" });
  }
  assert.equal((await post("login", { ...account, "cf-turnstile-response": "ok:login" })).status, 200);
  assert.equal((await post("email-request", { email: account.email, kind: "reset", "cf-turnstile-response": "ok:recovery" })).status, 200);
  assert.equal((await post("discover", { kind: "jobs", q: "x", "cf-turnstile-response": "ok:guest_search" })).status, 200);
});

test("write limits are per account, not shared by everyone", async (t) => {
  const { post, sent } = await start(t);
  const cookies = [];
  for (const name of ["busy", "calm"]) {
    const account = { email: name + "@example.test", password: "a perfectly fine password", privacyAccepted: true };
    await post("register", { ...account, "cf-turnstile-response": "ok:signup" });
    await post("email-complete", { kind: "verify", token: sent.at(-1).token });
    cookies.push((await post("login", { ...account, "cf-turnstile-response": "ok:login" })).cookie);
  }
  let limited = false;
  for (let i = 0; i < 130 && !limited; i++)
    limited = (await post("workspace/records", { kind: "profile", title: "t" + i }, cookies[0])).status === 429;
  assert.equal(limited, true);
  assert.equal((await post("workspace/records", { kind: "profile", title: "fine" }, cookies[1])).status, 201);
});

test("searches that cannot reach a source are not charged", async (t) => {
  let status = "busy";
  const { post } = await start(t, { search: async () => ({ rows: [], status, checkedAt: null }) });
  let cookie = "";
  for (let i = 0; i < 8; i++) {
    const r = await post("discover", { kind: "grants", q: "water", "cf-turnstile-response": "ok:guest_search" }, cookie);
    assert.equal(r.status, 200);
    assert.equal(r.data.remaining, 5);
    cookie ||= r.cookie;
  }
  status = "live";
  const charged = await post("discover", { kind: "grants", q: "water", "cf-turnstile-response": "ok:guest_search" }, cookie);
  assert.equal(charged.data.remaining, 4);
});

test("password reset links are checked before any password work", async (t) => {
  const { post } = await start(t);
  const started = Date.now();
  for (let i = 0; i < 15; i++)
    assert.equal((await post("email-complete", { kind: "reset", token: randomBytes(32).toString("hex"), password: "another long password" })).status, 400);
  assert.ok(Date.now() - started < 1500);
});

test("page addresses: app shell, branded 404 and long-lived asset caching", async (t) => {
  const dist = join(tmpdir(), "quarrix-dist-" + randomBytes(4).toString("hex"));
  mkdirSync(join(dist, "assets"), { recursive: true });
  writeFileSync(join(dist, "index.html"), "<!doctype html><title>Quarrix</title>");
  writeFileSync(join(dist, "assets", "app-abc123.js"), "console.log(1)");
  writeFileSync(join(dist, "robots.txt"), "User-agent: *");
  t.after(() => rmSync(dist, { recursive: true, force: true }));
  const { base } = await start(t, { dist });
  const home = await fetch(base + "/");
  assert.equal(home.status, 200);
  assert.equal(home.headers.get("cache-control"), "no-cache");
  const missing = await fetch(base + "/no-such-page");
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /<title>Quarrix/);
  assert.equal((await fetch(base + "/missing.png")).status, 404);
  assert.match((await fetch(base + "/assets/app-abc123.js")).headers.get("cache-control"), /immutable/);
  assert.equal((await fetch(base + "/robots.txt")).status, 200);
});

test("job matching uses every word in any order, ignoring case and accents", () => {
  const row = { title: "Senior React Developer", subtitle: "Acme · Berlin, Germany", detail: "TypeScript, frontend" };
  assert.ok(match("developer react", row) > 0);
  assert.ok(match("REACT", row) > 0);
  assert.equal(match("react native", row), 0);
  assert.ok(match("développeur", { title: "Developpeur web", subtitle: "", detail: "" }) > 0);
  assert.ok(match("react", row) > match("typescript", row));
  assert.equal(inRegion("germany", row), true);
  assert.equal(inRegion("canada", row), false);
  assert.equal(inRegion("", row), true);
});
