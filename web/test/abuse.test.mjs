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

async function start(t, { search, env = {}, dist } = {}) {
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

test("provider text is decoded and Jobicy gets a single keyword", async () => {
  const { keyword } = await import("../server/discovery.mjs");
  assert.equal(keyword("react developer"), "react");
  assert.equal(keyword("Senior Engineer"), "engineer");
  assert.equal(keyword("the"), "");
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes("jobicy"))
      return new Response(JSON.stringify({ jobs: [{ jobTitle: "R&amp;D Engineer &#8211; React", companyName: "A&amp;B", jobGeo: "EU", url: "https://jobicy.com/x" + calls.length, jobExcerpt: "<p>Build &quot;things&quot;</p>", pubDate: "2026-11-23T18:35:14+00:00" }] }));
    return new Response(JSON.stringify({ data: [], links: {} }));
  };
  try {
    const { discover } = await import("../server/discovery.mjs?decode");
    const r = await discover("jobs", "react engineer", "");
    assert.ok(calls.some((u) => u.includes("tag=react") && !u.includes("%20")));
    assert.equal(r.rows[0].title, "R&D Engineer – React");
    assert.match(r.rows[0].subtitle, /^A&B/);
    assert.match(r.rows[0].detail, /Build "things"/);
  } finally {
    globalThis.fetch = original;
  }
});

test("security headers and proxy diagnostics", async (t) => {
  const { base } = await start(t);
  const r = await fetch(base + "/api/health");
  assert.match(r.headers.get("permissions-policy"), /camera=\(\)/);
  assert.equal(r.headers.get("cross-origin-opener-policy"), "same-origin");
  assert.match(r.headers.get("strict-transport-security"), /includeSubDomains/);
  const body = await r.json();
  assert.equal(body.proxy.socket, "loopback");
  assert.deepEqual(body.proxy.forwardedFor, []);
  assert.equal(JSON.stringify(body).includes("127.0.0.1"), false);
});
