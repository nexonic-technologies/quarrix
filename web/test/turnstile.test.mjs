import test from "node:test";
import assert from "node:assert/strict";
import { turnstileConfig, verifyTurnstile } from "../server/turnstile.mjs";
import { openStore } from "../server/store.mjs";
import { createApp } from "../server/app.mjs";
import { randomBytes } from "node:crypto";

test("Turnstile configuration is scoped to the deployment hostname", () => {
  const env = { TURNSTILE_SITE_KEY: "fixture-site", TURNSTILE_SECRET: "fixture-secret", TURNSTILE_HOSTNAMES: "quarrix.example.test" };
  assert.equal(turnstileConfig(env, "https://quarrix.example.test").ready, true);
  assert.equal(turnstileConfig({ ...env, TURNSTILE_HOSTNAMES: "localhost,quarrix.example.test" }, "https://quarrix.example.test").ready, false);
  assert.equal(turnstileConfig({ ...env, TURNSTILE_SECRET: "" }, "https://quarrix.example.test").ready, false);
});

test("protected routes accept only their configured challenge and retain normal account verification", async (t) => {
  const keys = { ALLOW_REGISTRATION: "true", TURNSTILE_SITE_KEY: "fixture-site", TURNSTILE_SECRET: "fixture-secret", TURNSTILE_HOSTNAMES: "quarrix.example.test" };
  const previous = Object.fromEntries(Object.keys(keys).map(k => [k, process.env[k]]));
  Object.assign(process.env, keys);
  const store = await openStore({ url: "", file: ":memory:" });
  const sent = [];
  const app = createApp(store, { production: true, origin: "https://quarrix.example.test", dataKey: randomBytes(32),
    sendMail: async (...args) => sent.push(args),
    search: async () => ({ rows: [], status: "live", checkedAt: Date.now() }),
    turnstileRequest: async (_url, options) => ({ ok: true, json: async () => ({ success: true, hostname: "quarrix.example.test", action: options.body.get("response") }) }) });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(r => server.once("listening", r));
  t.after(async () => { for (const [k,v] of Object.entries(previous)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } await new Promise(r => server.close(r)); await store.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/`;
  const post = (path, body) => fetch(base + path, { method: "POST", headers: { Origin: "https://quarrix.example.test", "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const credentials = { email: "turnstile@example.test", password: "private test password", privacyAccepted: true };
  assert.equal((await post("register", { ...credentials, "cf-turnstile-response": "signup" })).status, 202);
  assert.equal(sent.length, 1);
  assert.equal((await post("email-complete", { kind: "verify", token: sent[0][2] })).status, 200);
  assert.equal((await post("login", { ...credentials, "cf-turnstile-response": "login" })).status, 200);
  assert.equal((await post("email-request", { email: credentials.email, kind: "reset", "cf-turnstile-response": "recovery" })).status, 200);
  assert.equal(sent.length, 2);
  assert.equal((await post("discover", { kind: "jobs", q: "test", "cf-turnstile-response": "guest_search" })).status, 200);
});

test("Turnstile requires verified action and exact hostname; errors fail closed", async () => {
  const config = turnstileConfig({ TURNSTILE_SITE_KEY: "fixture-site", TURNSTILE_SECRET: "fixture-secret", TURNSTILE_HOSTNAMES: "quarrix.example.test" }, "https://quarrix.example.test");
  for (const action of ["signup", "login", "recovery", "guest_search"]) {
    const mock = async (url, options) => {
      assert.equal(url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
      assert.equal(options.body.get("secret"), "fixture-secret");
      return { ok: true, json: async () => ({ success: true, action, hostname: config.hostname }) };
    };
    assert.equal(await verifyTurnstile(config, "fixture-token", action, mock), true);
    assert.equal(await verifyTurnstile(config, "", action, mock), false);
    assert.equal(await verifyTurnstile(config, "fixture-token", action, async () => ({ ok: true, json: async () => ({ success: false }) })), false);
    assert.equal(await verifyTurnstile(config, "fixture-token", action, async () => ({ ok: true, json: async () => ({ success: true, action: "wrong", hostname: config.hostname }) })), false);
    assert.equal(await verifyTurnstile(config, "fixture-token", action, async () => ({ ok: true, json: async () => ({ success: true, action, hostname: "localhost" }) })), false);
    assert.equal(await verifyTurnstile(config, "fixture-token", action, async () => { throw Error("offline"); }), false);
  }
});
