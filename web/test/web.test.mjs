import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { openStore } from "../server/store.mjs";
import { createApp } from "../server/app.mjs";
import { vault } from "../server/crypto.mjs";
import { webUrl } from "../server/discovery.mjs";
test("authenticated encryption preserves data and binds owner", () => {
  const v = vault(randomBytes(32)),
    c = v.seal("private", "owner:record");
  assert.equal(v.open(c, "owner:record").toString(), "private");
  assert.throws(() => v.open(c, "other:record"));
  assert.notEqual(c.toString(), "private");
  assert.equal(webUrl("javascript:alert(0)"), "");
});
test("workspace persistence, private accounts, quotas and owner controls", async (t) => {
  const store = await openStore({ file: ":memory:" }),
    key = randomBytes(32),
    token = randomBytes(32).toString("hex");
  process.env.ADMIN_TOKEN = token;
  const app = createApp(store, {
    dataKey: key,
    origin: "http://test.local",
    search: async () => ({
      rows: Array.from({ length: 20 }, (_, i) => ({
        title: "Job " + i,
        url: "https://example.com/" + i,
        source: "fixture",
      })),
      status: "live",
      checkedAt: Date.now(),
    }),
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    await store.close();
    delete process.env.ADMIN_TOKEN;
  });
  const base = `http://127.0.0.1:${server.address().port}/api/`;
  const request = async (
    path,
    {
      method = "GET",
      body,
      cookie = "",
      admin = false,
      origin = "http://test.local",
    } = {},
  ) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        Origin: origin,
        Cookie: cookie,
        ...(admin ? { Authorization: "Bearer " + token } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = response.headers.get("content-type")?.includes("json")
      ? await response.json()
      : Buffer.from(await response.arrayBuffer());
    return {
      status: response.status,
      data,
      cookie: response.headers
        .getSetCookie()
        .map((x) => x.split(";")[0])
        .join("; "),
    };
  };
  const post = (path, body, cookie = "", admin = false) =>
    request(path, { method: "POST", body, cookie, admin });
  const credentials = {
    email: "owner@example.test",
    password: "a long local password",
  };
  assert.equal((await post("register", credentials)).status, 201);
  const owner = await post("login", credentials),
    other = await post("register", {
      email: "other@example.test",
      password: "another long password",
    });
  assert.equal(owner.status, 200);
  assert.equal(other.status, 201);
  assert.equal((await request("workspace")).status, 401);
  const saved = await post(
    "workspace/records",
    { kind: "business", title: "My business", notes: "private notes" },
    owner.cookie,
  );
  assert.equal(saved.status, 201);
  assert.equal(
    (
      await store.one("SELECT email FROM accounts WHERE id=?", [
        owner.data.user.id,
      ])
    ).email === credentials.email,
    false,
  );
  assert.equal(
    (
      await store.one("SELECT body FROM records WHERE id=?", [saved.data.id])
    ).body.includes("private notes"),
    false,
  );
  const recordList = await request("workspace", { cookie: owner.cookie });
  assert.equal(recordList.data.records[0].title, "My business");
  assert.equal(
    (await request("workspace", { cookie: other.cookie })).data.records.length,
    0,
  );
  const secondDevice = await post("login", credentials);
  assert.equal(
    (await request("workspace", { cookie: secondDevice.cookie })).data
      .records[0].title,
    "My business",
  );
  const pdf = Buffer.from("%PDF-1.4\nlocal test fixture");
  const doc = await post(
    "workspace/documents",
    { name: "cv.pdf", content: pdf.toString("base64") },
    owner.cookie,
  );
  assert.equal(doc.status, 201);
  assert.equal(
    (
      await request("workspace/documents/" + doc.data.id, {
        cookie: owner.cookie,
      })
    ).data.toString(),
    pdf.toString(),
  );
  assert.equal(
    (
      await request("workspace/documents/" + doc.data.id, {
        cookie: other.cookie,
      })
    ).status,
    404,
  );
  assert.notDeepEqual(
    Buffer.from(
      (
        await store.one("SELECT content FROM documents WHERE id=?", [
          doc.data.id,
        ])
      ).content,
    ),
    pdf,
  );
  assert.equal(
    (
      await request("workspace/newsletter", {
        method: "PUT",
        body: { subscribed: true },
        cookie: owner.cookie,
      })
    ).data.subscribed,
    true,
  );
  const firstGuest = await post("discover", { kind: "jobs", q: "test" });
  assert.equal(firstGuest.status, 200);
  assert.equal(firstGuest.data.rows.length, 10);
  const guest = firstGuest.cookie;
  assert.equal(
    (await post("discover", { kind: "jobs", q: "test" }, guest)).status,
    429,
  );
  assert.equal(
    (await post("discover", { kind: "jobs", q: "test" }, owner.cookie)).data
      .rows.length,
    20,
  );
  assert.equal(
    (await request("workspace/history", { cookie: owner.cookie })).data
      .history[0].query,
    "test",
  );
  assert.equal(
    (await request("workspace/history", { cookie: other.cookie })).data.history
      .length,
    0,
  );
  assert.equal(
    (
      await request("workspace/history", {
        method: "DELETE",
        body: {},
        cookie: owner.cookie,
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("workspace/history", { cookie: owner.cookie })).data.history
      .length,
    0,
  );
  assert.equal((await request("admin/overview")).status, 403);
  const admin = await request("admin/overview", { admin: true });
  assert.equal(admin.data.total, 2);
  assert.equal(
    admin.data.accounts.find((x) => x.id === owner.data.user.id).documents,
    1,
  );
  assert.equal("content" in admin.data.accounts[0], false);
  assert.equal(
    (await request("admin/support/" + owner.data.user.id, { admin: true }))
      .status,
    403,
  );
  assert.equal(
    (
      await request("workspace/support", {
        method: "PUT",
        body: { share: true },
        cookie: owner.cookie,
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("admin/support/" + owner.data.user.id, { admin: true })).data
      .records[0].title,
    "My business",
  );
  assert.equal(
    (
      await request(
        "admin/support/" + owner.data.user.id + "/document/" + doc.data.id,
        { admin: true },
      )
    ).data.toString(),
    pdf.toString(),
  );
  await request("workspace/support", {
    method: "PUT",
    body: { share: false },
    cookie: owner.cookie,
  });
  assert.equal(
    (await request("admin/support/" + owner.data.user.id, { admin: true }))
      .status,
    403,
  );
  assert.equal(
    (
      await post(
        "admin/control",
        { action: "suspend", id: owner.data.user.id },
        "",
        true,
      )
    ).status,
    200,
  );
  assert.equal(
    (await request("workspace", { cookie: owner.cookie })).status,
    401,
  );
  assert.equal((await post("login", credentials)).status, 401);
  assert.equal(
    (
      await post(
        "admin/control",
        { action: "restore", id: owner.data.user.id },
        "",
        true,
      )
    ).status,
    200,
  );
  assert.equal((await post("login", credentials)).status, 200);
  await post("admin/control", { action: "maintenance-on" }, "", true);
  assert.equal((await request("session")).data.maintenance, true);
  assert.equal(
    (await post("discover", { kind: "jobs", q: "test" })).status,
    503,
  );
  await post("admin/control", { action: "maintenance-off" }, "", true);
  assert.equal((await request("session")).data.maintenance, false);
  assert.equal(
    (
      await request("workspace/records", {
        method: "POST",
        body: { kind: "business", title: "test" },
        origin: "https://other.example",
        cookie: other.cookie,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await post(
        "workspace/delete-account",
        { password: credentials.password },
        (await post("login", credentials)).cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    await store.one("SELECT id FROM documents WHERE id=?", [doc.data.id]),
    undefined,
  );
});
test("email verification and single-use password recovery", async (t) => {
  const store = await openStore({ file: ":memory:" }),
    sent = [];
  const app = createApp(store, {
    dataKey: randomBytes(32),
    origin: "http://test.local",
    sendMail: async (email, kind, token) => sent.push({ email, kind, token }),
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}/api/`;
  const post = async (path, body) => {
    const r = await fetch(base + path, {
      method: "POST",
      headers: {
        Origin: "http://test.local",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return { status: r.status, data: await r.json() };
  };
  const c = {
    email: "verified@example.test",
    password: "a long password for verification",
  };
  assert.equal((await post("register", c)).status, 202);
  assert.equal((await post("login", c)).status, 403);
  assert.equal(sent[0].kind, "verify");
  assert.equal(
    (await post("email-complete", { kind: "verify", token: sent[0].token }))
      .status,
    200,
  );
  assert.equal(
    (await post("email-complete", { kind: "verify", token: sent[0].token }))
      .status,
    400,
  );
  assert.equal((await post("login", c)).status, 200);
  await post("email-request", { email: c.email, kind: "reset" });
  assert.equal(sent[1].kind, "reset");
  assert.equal(
    (
      await post("email-complete", {
        kind: "reset",
        token: sent[1].token,
        password: "a new long password",
      })
    ).status,
    200,
  );
  assert.equal((await post("login", c)).status, 401);
  assert.equal(
    (await post("login", { ...c, password: "a new long password" })).status,
    200,
  );
});

test("private launch invitation preserves closed registration and requires verification", async (t) => {
  const store = await openStore({ file: ":memory:" });
  const sent = [], code = randomBytes(32).toString("hex");
  const keys = {
    ALLOW_REGISTRATION: "false",
    PRIVATE_REGISTRATION_EMAIL: "pilot@example.test",
    PRIVATE_REGISTRATION_TOKEN_HASH: createHash("sha256").update(code).digest("hex"),
    PRIVATE_REGISTRATION_EXPIRES_AT: new Date(Date.now() + 3600000).toISOString(),
  };
  const previous = Object.fromEntries(Object.keys(keys).map(k => [k, process.env[k]]));
  Object.assign(process.env, keys);
  const app = createApp(store, {
    production: true,
    dataKey: randomBytes(32),
    origin: "https://test.local",
    sendMail: async (email, kind, token) => sent.push({ email, kind, token }),
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(r => server.once("listening", r));
  t.after(async () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await new Promise(r => server.close(r));
    await store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}/api/`;
  const post = async (path, body, cookie = "") => {
    const response = await fetch(base + path, {
      method: "POST",
      headers: { Origin: "https://test.local", "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
    });
    return { status: response.status, cookie: response.headers.getSetCookie().map(x => x.split(";")[0]).join("; ") };
  };
  const credentials = { email: keys.PRIVATE_REGISTRATION_EMAIL, password: "private pilot strong password" };
  assert.equal((await post("register", credentials)).status, 403);
  assert.equal((await post("register", { ...credentials, email: "other@example.test", invitationCode: code })).status, 403);
  assert.equal((await post("register", { ...credentials, invitationCode: code })).status, 202);
  assert.equal(sent[0].kind, "verify");
  assert.equal((await post("login", credentials)).status, 403);
  assert.equal((await post("email-complete", { kind: "verify", token: sent[0].token })).status, 200);
  const login = await post("login", credentials);
  assert.equal(login.status, 200);
  assert.equal((await post("workspace/records", { kind: "business", title: "Pilot record" }, login.cookie)).status, 201);
  assert.equal((await post("email-request", { email: credentials.email, kind: "reset" })).status, 200);
  assert.equal(sent[1].kind, "reset");
  assert.equal((await post("email-complete", { kind: "reset", token: sent[1].token, password: "a new private pilot password" })).status, 200);
  const resetPassword = "a new private pilot password";
  const resetLogin = await post("login", { ...credentials, password: resetPassword });
  assert.equal(resetLogin.status, 200);
  assert.equal((await post("workspace/delete-account", { password: resetPassword }, resetLogin.cookie)).status, 200);
  assert.equal((await post("register", { ...credentials, invitationCode: code })).status, 409);
  process.env.PRIVATE_REGISTRATION_EXPIRES_AT = new Date(Date.now() - 1000).toISOString();
  assert.equal((await post("register", { ...credentials, invitationCode: code })).status, 403);
  assert.equal((await fetch(base + "session").then(r => r.json())).registrationMode, "closed");
});
