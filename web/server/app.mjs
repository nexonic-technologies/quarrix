import express from "express";
import {
  randomBytes,
  randomUUID,
  scrypt as scryptCb,
  timingSafeEqual,
  createHash,
  createHmac,
} from "node:crypto";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { discover, webUrl } from "./discovery.mjs";
import { vault, localKey } from "./crypto.mjs";
const scrypt = promisify(scryptCb),
  hash = (v) => createHash("sha256").update(v).digest("hex");
const text = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const DAY = 86400000;
async function passwordHash(password, salt = randomBytes(16).toString("hex")) {
  return salt + ":" + (await scrypt(password, salt, 64)).toString("hex");
}
const fakeHash = "0".repeat(32) + ":" + "0".repeat(128);
const equal = (a, b) => a.length === b.length && timingSafeEqual(a, b);
function limit(max, window) {
  let start = Date.now(),
    count = 0;
  return () => {
    if (Date.now() - start >= window) {
      start = Date.now();
      count = 0;
    }
    return ++count <= max;
  };
}
const kinds = new Set([
  "profile",
  "business",
  "opportunity",
  "application",
  "customer",
  "resume",
]);
function record(input) {
  const kind = input?.kind;
  if (!kinds.has(kind)) throw Error("Choose a valid record type.");
  const title = text(input.title, 160),
    notes = text(input.notes, 8000),
    url = text(input.url, 1000),
    status = text(input.status, 60);
  if (!title) throw Error("Title is required.");
  if (url && !webUrl(url)) throw Error("Invalid website URL.");
  return { kind, title, notes, url, status };
}
export function createApp(
  store,
  {
    production = false,
    origin = "http://127.0.0.1:4322",
    search = discover,
    dist = resolve("dist"),
    dataKey = localKey(),
    sendMail = null,
  } = {},
) {
  const encryption = vault(dataKey),
    emailDigest = (email) =>
      createHmac("sha256", dataKey)
        .update("email:" + email)
        .digest("hex"),
    decodeEmail = (x) => ({
      ...x,
      email: encryption
        .open(Buffer.from(x.email, "base64"), x.id + ":email")
        .toString(),
    }),
    sealRecord = (body, owner, id) =>
      encryption
        .seal(JSON.stringify(body), owner + ":" + id)
        .toString("base64");
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    });
    if (production) res.set("Strict-Transport-Security", "max-age=31536000");
    next();
  });
  const adminAuth = (req) => {
    const secret = process.env.ADMIN_TOKEN;
    return !!(
      secret &&
      secret.length >= 32 &&
      equal(
        Buffer.from(req.get("authorization") || ""),
        Buffer.from("Bearer " + secret),
      )
    );
  };
  const maintenance = async () =>
    !!(await store.one(
      "SELECT id FROM portal_settings WHERE id='maintenance'",
    ));
  app.use("/api", async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!["GET", "HEAD"].includes(req.method)) {
      if (
        req.get("origin") !== origin &&
        !(req.path.startsWith("/admin/") && adminAuth(req))
      )
        return res.status(403).json({ error: "Request origin not allowed." });
      if (!req.is("application/json"))
        return res.status(415).json({ error: "JSON required." });
    }
    if (
      !req.path.startsWith("/admin/") &&
      !["/health", "/session", "/logout"].includes(req.path) &&
      (await maintenance())
    )
      return res.status(503).json({
        error: "Work in progress. Please check back shortly.",
        maintenance: true,
      });
    next();
  });
  app.use("/api", express.json({ limit: "3mb" }));
  const authLimit = limit(30, 60000),
    searchLimit = limit(90, 60000),
    writeLimit = limit(180, 60000);
  let queue = Promise.resolve();
  const serial = (fn) => {
    const p = queue.then(fn);
    queue = p.catch(() => {});
    return p;
  };
  async function quota(id, max, units = 1) {
    return serial(async () => {
      const now = Date.now(),
        day = Math.floor(now / DAY),
        key = `${id}:${day}`;
      await store.run("DELETE FROM `usage` WHERE expires<?", [now]);
      const r = await store.one("SELECT n FROM `usage` WHERE id=?", [key]),
        n = Number(r?.n || 0);
      if (n >= max) return -1;
      const used = Math.min(units, max - n);
      if (r)
        await store.run("UPDATE `usage` SET n=n+? WHERE id=?", [used, key]);
      else
        await store.run("INSERT INTO `usage`(id,n,expires) VALUES(?,?,?)", [
          key,
          used,
          (day + 1) * DAY,
        ]);
      return max - n - used;
    });
  }
  const token = (req) => {
    const m = (req.get("cookie") || "").match(
      /(?:^|;\s*)quarrix_session=([a-f0-9]{64})(?:;|$)/,
    );
    return m?.[1];
  };
  const cookie = (res, value, maxAge) =>
    res.cookie("quarrix_session", value, {
      httpOnly: true,
      sameSite: "lax",
      secure: production,
      path: "/",
      maxAge,
    });
  async function session(req) {
    const t = token(req);
    if (!t) return null;
    const row = await store.one(
      "SELECT a.id,a.email FROM sessions s JOIN accounts a ON s.owner=a.id WHERE s.digest=? AND s.expires>? AND NOT EXISTS (SELECT 1 FROM suspended b WHERE b.owner=a.id)",
      [hash(t), Date.now()],
    );
    return row ? decodeEmail(row) : null;
  }
  async function requireUser(req, res, next) {
    const user = await session(req);
    if (!user)
      return res
        .status(401)
        .json({ error: "Sign in to access your private workspace." });
    req.user = user;
    next();
  }
  async function signIn(req, res, id) {
    const old = token(req);
    if (old)
      await store.run("DELETE FROM sessions WHERE digest=?", [hash(old)]);
    await store.run("DELETE FROM sessions WHERE expires<?", [Date.now()]);
    const t = randomBytes(32).toString("hex");
    await store.run(
      "INSERT INTO sessions(digest,owner,expires) VALUES(?,?,?)",
      [hash(t), id, Date.now() + 7 * DAY],
    );
    cookie(res, t, 7 * DAY);
  }
  async function emailToken(user, kind) {
    if (!sendMail) return;
    const token = randomBytes(32).toString("hex");
    await serial(async () => {
      await store.run(
        "DELETE FROM email_tokens WHERE (owner=? AND kind=?) OR expires<?",
        [user.id, kind, Date.now()],
      );
      await store.run(
        "INSERT INTO email_tokens(digest,owner,kind,expires) VALUES(?,?,?,?)",
        [hash(token), user.id, kind, Date.now() + 1800000],
      );
    });
    await sendMail(user.email, kind, token);
  }
  app.post("/api/email-request", async (req, res) => {
    if (!authLimit())
      return res.status(429).json({ error: "Try again later." });
    if (!sendMail)
      return res
        .status(503)
        .json({ error: "Email delivery is not configured." });
    const kind = req.body.kind === "verify" ? "verify" : "reset",
      email = text(req.body.email, 254).toLowerCase();
    if ((await quota("mail:" + emailDigest(email), 3)) < 0)
      return res.status(429).json({ error: "Try again later." });
    const user = await store.one(
      "SELECT id,email FROM accounts WHERE email_digest=?",
      [emailDigest(email)],
    );
    if (user)
      try {
        await emailToken(decodeEmail(user), kind);
      } catch {}
    res.json({
      ok: true,
      message: "If the account exists, we will send an email.",
    });
  });
  app.post("/api/email-complete", async (req, res) => {
    if (!authLimit())
      return res.status(429).json({ error: "Try again later." });
    const kind = req.body.kind,
      raw = req.body.token,
      p = req.body.password;
    if (
      !["verify", "reset"].includes(kind) ||
      typeof raw !== "string" ||
      !/^[a-f0-9]{64}$/.test(raw) ||
      (kind === "reset" &&
        (typeof p !== "string" || p.length < 12 || p.length > 128))
    )
      return res.status(400).json({ error: "Invalid request." });
    const password = kind === "reset" ? await passwordHash(p) : null;
    await serial(async () => {
      const row = await store.one(
        "SELECT owner FROM email_tokens WHERE digest=? AND kind=? AND expires>?",
        [hash(raw), kind, Date.now()],
      );
      if (!row)
        return res.status(400).json({ error: "Link expired or invalid." });
      await store.run("DELETE FROM email_tokens WHERE digest=?", [hash(raw)]);
      if (
        !(await store.one("SELECT owner FROM verified_accounts WHERE owner=?", [
          row.owner,
        ]))
      )
        await store.run(
          "INSERT INTO verified_accounts(owner,created) VALUES(?,?)",
          [row.owner, Date.now()],
        );
      if (kind === "reset") {
        await store.run("UPDATE accounts SET password_hash=? WHERE id=?", [
          password,
          row.owner,
        ]);
        await store.run("DELETE FROM sessions WHERE owner=?", [row.owner]);
      }
      res.json({ ok: true });
    });
  });
  app.get("/api/health", (req, res) =>
    res.json({ ok: true, version: "4.0.0" }),
  );
  app.get("/api/session", async (req, res) =>
    res.json({
      user: (await session(req)) || null,
      maintenance: await maintenance(),
      assistantAvailable: !!(
        process.env.OPENROUTER_API_KEY &&
        process.env.OPENROUTER_MODEL?.endsWith(":free")
      ),
    }),
  );
  app.post("/api/register", async (req, res) => {
    if (!authLimit())
      return res.status(429).json({ error: "Try again later." });
    const email = text(req.body.email, 254).toLowerCase(),
      password = req.body.password;
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof password !== "string" ||
      password.length < 12 ||
      password.length > 128
    )
      return res
        .status(400)
        .json({ error: "Use a valid email and 12–128 character password." });
    if (production && (process.env.ALLOW_REGISTRATION !== "true" || !sendMail))
      return res.status(403).json({ error: "Registration is not open yet." });
    const id = randomUUID(),
      encoded = await passwordHash(password);
    const maxAccounts = Math.max(
      1,
      Math.min(5000, Number(process.env.MAX_ACCOUNTS) || 500),
    );
    try {
      const created = await serial(async () => {
        if (
          Number((await store.one("SELECT COUNT(*) AS n FROM accounts")).n) >=
          maxAccounts
        )
          return false;
        await store.run(
          "INSERT INTO accounts(id,email,email_digest,password_hash,created) VALUES(?,?,?,?,?)",
          [
            id,
            encryption.seal(email, id + ":email").toString("base64"),
            emailDigest(email),
            encoded,
            Date.now(),
          ],
        );
        return true;
      });
      if (!created)
        return res
          .status(503)
          .json({ error: "Registration capacity reached. Please try later." });
    } catch (e) {
      if (/unique|duplicate/i.test(e.message))
        return res
          .status(409)
          .json({ error: "Unable to register this account." });
      throw e;
    }
    if (req.body.newsletter === true)
      await store.run("INSERT INTO newsletter(owner,subscribed) VALUES(?,?)", [
        id,
        Date.now(),
      ]);
    if (sendMail) {
      try {
        await emailToken({ id, email }, "verify");
      } catch {}
      return res.status(202).json({
        verificationRequired: true,
        message:
          "Check your inbox. You can request another verification link if needed.",
      });
    }
    await store.run(
      "INSERT INTO verified_accounts(owner,created) VALUES(?,?)",
      [id, Date.now()],
    );
    await signIn(req, res, id);
    res.status(201).json({ user: { id, email } });
  });
  app.post("/api/login", async (req, res) => {
    if (!authLimit())
      return res.status(429).json({ error: "Try again later." });
    const email = text(req.body.email, 254).toLowerCase(),
      password = req.body.password;
    if (typeof password !== "string" || password.length > 128)
      return res.status(400).json({ error: "Invalid credentials." });
    const user = await store.one(
        "SELECT id,email,password_hash FROM accounts WHERE email_digest=?",
        [emailDigest(email)],
      ),
      expected = user?.password_hash || fakeHash;
    const actual = await passwordHash(password, expected.split(":")[0]);
    if (
      !equal(Buffer.from(actual), Buffer.from(expected)) ||
      !user ||
      (await store.one("SELECT owner FROM suspended WHERE owner=?", [user.id]))
    )
      return res.status(401).json({ error: "Invalid credentials." });
    if (
      !(await store.one("SELECT owner FROM verified_accounts WHERE owner=?", [
        user.id,
      ]))
    )
      return res
        .status(403)
        .json({ error: "Verify your email before signing in." });
    await signIn(req, res, user.id);
    res.json({ user: { id: user.id, email: decodeEmail(user).email } });
  });
  app.post("/api/logout", async (req, res) => {
    const t = token(req);
    if (t) await store.run("DELETE FROM sessions WHERE digest=?", [hash(t)]);
    cookie(res, "", 0);
    res.json({ ok: true });
  });
  app.post("/api/discover", async (req, res) => {
    if (!searchLimit())
      return res
        .status(429)
        .json({ error: "Search capacity reached; try again shortly." });
    const kind = text(req.body.kind, 20),
      q = text(req.body.q, 100),
      location = text(req.body.location, 100);
    if (!q || !["jobs", "grants", "business"].includes(kind))
      return res.status(400).json({ error: "Enter a valid query." });
    const user = await session(req);
    let guest = (req.get("cookie") || "").match(
      /(?:^|;\s*)quarrix_guest=([a-f0-9]{32})(?:;|$)/,
    )?.[1];
    if (!guest) {
      guest = randomBytes(16).toString("hex");
      res.cookie("quarrix_guest", guest, {
        httpOnly: true,
        sameSite: "lax",
        secure: production,
        maxAge: 30 * DAY,
        path: "/",
      });
    }
    const remaining = await quota(
      user ? "search:" + user.id : "guest:" + hash(guest),
      user ? 50 : 5,
    );
    if (remaining < 0)
      return res.status(429).json({
        error: user
          ? "Daily search limit reached."
          : "Your five guest searches are used. Create a free account to continue.",
        registrationRequired: !user,
      });
    if (!user) {
      const used = await store.one("SELECT n FROM `usage` WHERE id=?", [
        `guest-results:${hash(guest)}:${Math.floor(Date.now() / DAY)}`,
      ]);
      if (Number(used?.n || 0) >= 10)
        return res.status(429).json({
          error:
            "Your ten free guest results are used. Create a free account to continue.",
          registrationRequired: true,
        });
    }
    const result = await search(kind, q, location);
    if (user) {
      const id = randomUUID();
      await store.run("DELETE FROM search_history WHERE created<?", [
        Date.now() - 30 * DAY,
      ]);
      await store.run(
        "INSERT INTO search_history(id,owner,body,created) VALUES(?,?,?,?)",
        [
          id,
          user.id,
          sealRecord(
            {
              kind,
              query: q,
              location,
              status: result.status,
              count: result.rows.length,
            },
            user.id,
            id,
          ),
          Date.now(),
        ],
      );
      return res.json({
        ...result,
        remaining,
        rows: result.rows.slice(0, 50),
        limited: false,
      });
    }
    const allowance = await serial(async () => {
      const id = `guest-results:${hash(guest)}:${Math.floor(Date.now() / DAY)}`,
        r = await store.one("SELECT n FROM `usage` WHERE id=?", [id]),
        left = Math.max(0, 10 - Number(r?.n || 0)),
        used = Math.min(left, result.rows.length);
      if (r) await store.run("UPDATE `usage` SET n=n+? WHERE id=?", [used, id]);
      else
        await store.run("INSERT INTO `usage`(id,n,expires) VALUES(?,?,?)", [
          id,
          used,
          (Math.floor(Date.now() / DAY) + 1) * DAY,
        ]);
      return { used, left: left - used };
    });
    if (!allowance.used && result.rows.length)
      return res.status(429).json({
        error:
          "Your ten free guest results are used. Create a free account to continue.",
        registrationRequired: true,
      });
    res.json({
      ...result,
      remaining,
      guestResultsLeft: allowance.left,
      rows: result.rows.slice(0, allowance.used),
      limited: result.rows.length > allowance.used,
    });
  });
  app.use("/api/workspace", requireUser, (req, res, next) => {
    if (!["GET", "HEAD"].includes(req.method) && !writeLimit())
      return res.status(429).json({ error: "Try again shortly." });
    next();
  });
  app.get("/api/workspace", async (req, res) => {
    const owner = req.user.id;
    res.json({
      records: (
        await store.all(
          "SELECT id,kind,body,updated FROM records WHERE owner=? ORDER BY updated DESC",
          [owner],
        )
      ).map((r) => ({
        ...JSON.parse(
          encryption
            .open(Buffer.from(r.body, "base64"), owner + ":" + r.id)
            .toString(),
        ),
        id: r.id,
        updated: r.updated,
      })),
      documents: (
        await store.all(
          "SELECT id,name,mime,bytes FROM documents WHERE owner=?",
          [owner],
        )
      ).map((d) => ({
        ...d,
        name: encryption
          .open(Buffer.from(d.name, "base64"), owner + ":" + d.id + ":name")
          .toString(),
      })),
    });
  });
  // Serialize quota checks and writes in the single managed Node process.
  const history = async (owner) => {
    await store.run("DELETE FROM search_history WHERE created<?", [
      Date.now() - 30 * DAY,
    ]);
    return (
      await store.all(
        "SELECT id,body,created FROM search_history WHERE owner=? ORDER BY created DESC LIMIT 50",
        [owner],
      )
    ).map((r) => ({
      ...JSON.parse(
        encryption
          .open(Buffer.from(r.body, "base64"), owner + ":" + r.id)
          .toString(),
      ),
      created: r.created,
    }));
  };
  app.get("/api/workspace/history", async (req, res) =>
    res.json({ history: await history(req.user.id) }),
  );
  app.delete("/api/workspace/history", async (req, res) => {
    await store.run("DELETE FROM search_history WHERE owner=?", [req.user.id]);
    res.json({ ok: true });
  });
  app.get("/api/workspace/newsletter", async (req, res) =>
    res.json({
      subscribed: !!(await store.one(
        "SELECT owner FROM newsletter WHERE owner=?",
        [req.user.id],
      )),
    }),
  );
  app.get("/api/workspace/support", async (req, res) =>
    res.json({
      expires: Number(
        (
          await store.one(
            "SELECT expires FROM support_grants WHERE owner=? AND expires>?",
            [req.user.id, Date.now()],
          )
        )?.expires || 0,
      ),
    }),
  );
  app.put("/api/workspace/support", async (req, res) => {
    if (typeof req.body.share !== "boolean")
      return res.status(400).json({ error: "Choose a support preference." });
    const expires = req.body.share ? Date.now() + 3600000 : 0;
    await serial(async () => {
      await store.run("DELETE FROM support_grants WHERE owner=?", [
        req.user.id,
      ]);
      if (expires)
        await store.run(
          "INSERT INTO support_grants(owner,expires) VALUES(?,?)",
          [req.user.id, expires],
        );
    });
    res.json({ expires });
  });
  app.put("/api/workspace/newsletter", async (req, res) => {
    if (typeof req.body.subscribed !== "boolean")
      return res.status(400).json({ error: "Choose a newsletter preference." });
    await serial(async () => {
      await store.run("DELETE FROM newsletter WHERE owner=?", [req.user.id]);
      if (req.body.subscribed)
        await store.run(
          "INSERT INTO newsletter(owner,subscribed) VALUES(?,?)",
          [req.user.id, Date.now()],
        );
    });
    res.json({ subscribed: req.body.subscribed });
  });
  app.post("/api/workspace/assistant", async (req, res) => {
    const key = process.env.OPENROUTER_API_KEY,
      model = process.env.OPENROUTER_MODEL;
    if (!key || !model?.endsWith(":free"))
      return res
        .status(503)
        .json({ error: "Optional assistant is not configured." });
    const question = text(req.body.question, 1500);
    if (!question || req.body.consent !== true)
      return res.status(400).json({
        error: "Enter a question and consent to sending it to the provider.",
      });
    const remaining = await quota("assistant:" + req.user.id, 3);
    if (remaining < 0 || (await quota("assistant:global", 30)) < 0)
      return res
        .status(429)
        .json({ error: "Free assistant capacity reached." });
    try {
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(20000),
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            "HTTP-Referer": origin,
            "X-Title": "Quarrix",
          },
          body: JSON.stringify({
            model,
            max_tokens: 350,
            messages: [
              {
                role: "system",
                content:
                  "Provide general career or small business guidance. Be concise, do not invent verified facts or make hiring decisions.",
              },
              { role: "user", content: question },
            ],
          }),
        },
      );
      if (!response.ok)
        return res
          .status(503)
          .json({ error: "Free assistant is temporarily unavailable." });
      const data = await response.json();
      res.json({
        answer: text(data.choices?.[0]?.message?.content, 3000),
        remaining,
      });
    } catch {
      return res
        .status(503)
        .json({ error: "Free assistant is temporarily unavailable." });
    }
  });
  app.post("/api/workspace/records", async (req, res) => {
    let body;
    try {
      body = record(req.body);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    const id = randomUUID(),
      owner = req.user.id;
    await serial(async () => {
      if (
        Number(
          (
            await store.one("SELECT COUNT(*) AS n FROM records WHERE owner=?", [
              owner,
            ])
          ).n,
        ) >= 500
      )
        return res
          .status(409)
          .json({ error: "Workspace record limit reached." });
      await store.run(
        "INSERT INTO records(id,owner,kind,body,updated) VALUES(?,?,?,?,?)",
        [id, owner, body.kind, sealRecord(body, owner, id), Date.now()],
      );
      res.status(201).json({ id, ...body });
    });
  });
  app.put("/api/workspace/records/:id", async (req, res) => {
    let body;
    try {
      body = record(req.body);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    const r = await store.run(
      "UPDATE records SET kind=?,body=?,updated=? WHERE id=? AND owner=?",
      [
        body.kind,
        sealRecord(body, req.user.id, req.params.id),
        Date.now(),
        req.params.id,
        req.user.id,
      ],
    );
    return r.changes
      ? res.json({ id: req.params.id, ...body })
      : res.status(404).json({ error: "Record not found." });
  });
  app.delete("/api/workspace/records/:id", async (req, res) => {
    const r = await store.run("DELETE FROM records WHERE id=? AND owner=?", [
      req.params.id,
      req.user.id,
    ]);
    res.status(r.changes ? 200 : 404).json({ ok: !!r.changes });
  });
  app.post("/api/workspace/documents", async (req, res) => {
    const name = text(req.body.name, 160).replace(/[^\p{L}\p{N} ._-]/gu, "_"),
      mime = "application/pdf",
      raw = req.body.content;
    if (
      !name.toLowerCase().endsWith(".pdf") ||
      typeof raw !== "string" ||
      raw.length > 2_800_000 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)
    )
      return res.status(400).json({ error: "Upload a PDF up to 2 MB." });
    const bytes = Buffer.from(raw, "base64");
    if (bytes.length > 2_000_000 || bytes.subarray(0, 5).toString() !== "%PDF-")
      return res.status(400).json({ error: "Invalid PDF or exceeds 2 MB." });
    await serial(async () => {
      const owner = req.user.id,
        used = await store.one(
          "SELECT COUNT(*) AS n,COALESCE(SUM(bytes),0) AS total FROM documents WHERE owner=?",
          [owner],
        );
      if (
        Number(used.n) >= 10 ||
        Number(used.total) + bytes.length > 10_000_000
      )
        return res
          .status(409)
          .json({ error: "10 MB workspace document limit reached." });
      const id = randomUUID();
      await store.run(
        "INSERT INTO documents(id,owner,name,mime,bytes,content) VALUES(?,?,?,?,?,?)",
        [
          id,
          owner,
          encryption.seal(name, owner + ":" + id + ":name").toString("base64"),
          mime,
          bytes.length,
          encryption.seal(bytes, owner + ":" + id),
        ],
      );
      res.status(201).json({ id, name, mime, bytes: bytes.length });
    });
  });
  app.get("/api/workspace/documents/:id", async (req, res) => {
    const doc = await store.one(
      "SELECT name,content FROM documents WHERE id=? AND owner=?",
      [req.params.id, req.user.id],
    );
    if (!doc) return res.status(404).json({ error: "Document not found." });
    res
      .attachment(
        encryption
          .open(
            Buffer.from(doc.name, "base64"),
            req.user.id + ":" + req.params.id + ":name",
          )
          .toString(),
      )
      .type("application/octet-stream")
      .send(encryption.open(doc.content, req.user.id + ":" + req.params.id));
  });
  app.delete("/api/workspace/documents/:id", async (req, res) => {
    const r = await store.run("DELETE FROM documents WHERE id=? AND owner=?", [
      req.params.id,
      req.user.id,
    ]);
    res.status(r.changes ? 200 : 404).json({ ok: !!r.changes });
  });
  app.post("/api/workspace/delete-account", async (req, res) => {
    const u = await store.one("SELECT password_hash FROM accounts WHERE id=?", [
        req.user.id,
      ]),
      p = req.body.password;
    if (
      typeof p !== "string" ||
      p.length > 128 ||
      !u ||
      !equal(
        Buffer.from(await passwordHash(p, u.password_hash.split(":")[0])),
        Buffer.from(u.password_hash),
      )
    )
      return res.status(401).json({ error: "Invalid credentials." });
    await store.run("DELETE FROM accounts WHERE id=?", [req.user.id]);
    cookie(res, "", 0);
    res.json({ ok: true });
  });
  const adminLimit = limit(30, 60000);
  app.get("/api/admin/audit", async (req, res) => {
    if (!adminAuth(req)) return res.status(403).json({ error: "Forbidden." });
    if (!adminLimit()) return res.status(429).json({ error: "Try later." });
    res.json({
      events: await store.all(
        "SELECT action,target,created FROM admin_audit ORDER BY created DESC LIMIT 100",
      ),
    });
  });
  app.get("/api/admin/support/:id", async (req, res) => {
    if (!adminAuth(req)) return res.status(403).json({ error: "Forbidden." });
    if (!adminLimit()) return res.status(429).json({ error: "Try later." });
    const owner = req.params.id;
    if (
      !(await store.one(
        "SELECT owner FROM support_grants WHERE owner=? AND expires>?",
        [owner, Date.now()],
      ))
    )
      return res
        .status(403)
        .json({ error: "User has not authorized support access." });
    const records = (
      await store.all("SELECT id,body FROM records WHERE owner=?", [owner])
    ).map((r) =>
      JSON.parse(
        encryption
          .open(Buffer.from(r.body, "base64"), owner + ":" + r.id)
          .toString(),
      ),
    );
    const documents = (
      await store.all("SELECT id,name,bytes FROM documents WHERE owner=?", [
        owner,
      ])
    ).map((d) => ({
      ...d,
      name: encryption
        .open(Buffer.from(d.name, "base64"), owner + ":" + d.id + ":name")
        .toString(),
    }));
    await store.run(
      "INSERT INTO admin_audit(id,action,target,created) VALUES(?,?,?,?)",
      [randomUUID(), "support-view", owner, Date.now()],
    );
    res.json({ records, documents, history: await history(owner) });
  });
  app.get("/api/admin/support/:id/document/:doc", async (req, res) => {
    if (!adminAuth(req)) return res.status(403).json({ error: "Forbidden." });
    if (!adminLimit()) return res.status(429).json({ error: "Try later." });
    const owner = req.params.id,
      doc = req.params.doc;
    if (
      !(await store.one(
        "SELECT owner FROM support_grants WHERE owner=? AND expires>?",
        [owner, Date.now()],
      ))
    )
      return res
        .status(403)
        .json({ error: "User has not authorized support access." });
    const item = await store.one(
      "SELECT name,content FROM documents WHERE owner=? AND id=?",
      [owner, doc],
    );
    if (!item) return res.status(404).json({ error: "Document not found." });
    await store.run(
      "INSERT INTO admin_audit(id,action,target,created) VALUES(?,?,?,?)",
      [randomUUID(), "support-download", doc, Date.now()],
    );
    res
      .attachment(
        encryption
          .open(Buffer.from(item.name, "base64"), owner + ":" + doc + ":name")
          .toString(),
      )
      .type("application/octet-stream")
      .send(encryption.open(item.content, owner + ":" + doc));
  });
  app.get("/api/admin/overview", async (req, res) => {
    const secret = process.env.ADMIN_TOKEN;
    if (
      !secret ||
      secret.length < 32 ||
      !equal(
        Buffer.from(req.get("authorization") || ""),
        Buffer.from("Bearer " + secret),
      )
    )
      return res.status(403).json({ error: "Forbidden." });
    if (!adminLimit()) return res.status(429).json({ error: "Try later." });
    const offset = Math.max(
        0,
        Math.min(100000, Math.floor(Number(req.query.offset) || 0)),
      ),
      rows = await store.all(
        "SELECT a.id,a.email,a.created,(SELECT COUNT(*) FROM suspended b WHERE b.owner=a.id) AS suspended,(SELECT COUNT(*) FROM verified_accounts v WHERE v.owner=a.id) AS verified,(SELECT COUNT(*) FROM records r WHERE r.owner=a.id) AS records,(SELECT COUNT(*) FROM documents d WHERE d.owner=a.id) AS documents,(SELECT COALESCE(SUM(bytes),0) FROM documents d WHERE d.owner=a.id) AS bytes,(SELECT COUNT(*) FROM newsletter n JOIN verified_accounts v ON v.owner=n.owner WHERE n.owner=a.id) AS subscribed FROM accounts a ORDER BY a.created DESC LIMIT 100 OFFSET " +
          offset,
      );
    const day = Math.floor(Date.now() / DAY);
    const total = await store.one("SELECT COUNT(*) AS n FROM accounts");
    const searches = await store.one(
      "SELECT COALESCE(SUM(n),0) AS n FROM `usage` WHERE id LIKE ? OR id LIKE ?",
      [`search:%:${day}`, `guest:%:${day}`],
    );
    res.json({
      maintenance: await maintenance(),
      total: Number(total.n),
      searchesToday: Number(searches.n),
      accounts: await Promise.all(
        rows.map(async (x) => {
          const usage = await store.one("SELECT n FROM `usage` WHERE id=?", [
            `search:${x.id}:${day}`,
          ]);
          return { ...decodeEmail(x), searchesToday: Number(usage?.n || 0) };
        }),
      ),
    });
  });
  app.post("/api/admin/control", async (req, res) => {
    if (!adminAuth(req)) return res.status(403).json({ error: "Forbidden." });
    if (!adminLimit()) return res.status(429).json({ error: "Try later." });
    const action = req.body.action,
      id = text(req.body.id, 36);
    if (
      !["suspend", "restore", "maintenance-on", "maintenance-off"].includes(
        action,
      )
    )
      return res.status(400).json({ error: "Invalid action." });
    await serial(async () => {
      if (action.startsWith("maintenance")) {
        if (action === "maintenance-on") {
          if (!(await maintenance()))
            await store.run(
              "INSERT INTO portal_settings(id,value) VALUES('maintenance','on')",
            );
        } else
          await store.run("DELETE FROM portal_settings WHERE id='maintenance'");
      } else {
        if (!(await store.one("SELECT id FROM accounts WHERE id=?", [id])))
          return res.status(404).json({ error: "Account not found." });
        if (action === "suspend") {
          if (
            !(await store.one("SELECT owner FROM suspended WHERE owner=?", [
              id,
            ]))
          )
            await store.run(
              "INSERT INTO suspended(owner,created) VALUES(?,?)",
              [id, Date.now()],
            );
          await store.run("DELETE FROM sessions WHERE owner=?", [id]);
          await store.run("DELETE FROM support_grants WHERE owner=?", [id]);
        } else await store.run("DELETE FROM suspended WHERE owner=?", [id]);
      }
      await store.run(
        "INSERT INTO admin_audit(id,action,target,created) VALUES(?,?,?,?)",
        [randomUUID(), action, id || "portal", Date.now()],
      );
      res.json({ ok: true });
    });
  });
  app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));
  app.use(express.static(dist, { index: "index.html", dotfiles: "deny" }));
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    res.status(err.status === 413 ? 413 : err.status === 400 ? 400 : 500).json({
      error:
        err.status === 413
          ? "Request too large."
          : err.status === 400
            ? "Invalid request."
            : "Request failed.",
    });
  });
  return app;
}
