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
import { resolve, extname } from "node:path";
import { readFileSync } from "node:fs";
import { discover, webUrl } from "./discovery.mjs";
import { keyedLimit, keyedLock } from "./limits.mjs";
import { vault, localKey } from "./crypto.mjs";
import { turnstileConfig, verifyTurnstile } from "./turnstile.mjs";
import { localPdfScanner } from "./pdf-scan.mjs";
const scrypt = promisify(scryptCb),
  hash = (v) => createHash("sha256").update(v).digest("hex");
const text = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const DAY = 86400000;
const PRIVACY_VERSION = "2026-11-23";
async function passwordHash(password, salt = randomBytes(16).toString("hex")) {
  return salt + ":" + (await scrypt(password, salt, 64)).toString("hex");
}
const fakeHash = "0".repeat(32) + ":" + "0".repeat(128);
const equal = (a, b) => a.length === b.length && timingSafeEqual(a, b);
const envInt = (name, fallback, min = 1, max = 1_000_000) => {
  const n = Math.floor(Number(process.env[name]));
  return Number.isFinite(n) && n >= min ? Math.min(n, max) : fallback;
};
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
    turnstileRequest = fetch,
    scanPdf = localPdfScanner(),
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
  const challenge = turnstileConfig(process.env, origin);
  let activeChallenges = 0;
  const challengeGate = async (req, res, action) => {
    if (!challenge.enabled) return true;
    if (activeChallenges >= 32) { res.status(503).json({ error: "Security check is busy. Please retry." }); return false; }
    activeChallenges++;
    try { if (await verifyTurnstile(challenge, req.body?.["cf-turnstile-response"], action, turnstileRequest)) return true; }
    finally { activeChallenges--; }
    res.status(403).json({ error: "Please complete the security check and try again." });
    return false;
  };
  app.disable("x-powered-by");
  // Only trust forwarded client addresses when the deployment says how many
  // proxies sit in front of the app (TRUST_PROXY_HOPS). Otherwise the socket
  // address is used and spoofed X-Forwarded-For headers are ignored.
  const hops = envInt("TRUST_PROXY_HOPS", 0, 0, 5);
  if (hops) app.set("trust proxy", hops);
  const client = (req) => "ip:" + (req.ip || req.socket?.remoteAddress || "unknown");
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
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
  const privateRegistration = () => {
    const email = text(process.env.PRIVATE_REGISTRATION_EMAIL, 254).toLowerCase();
    const digest = process.env.PRIVATE_REGISTRATION_TOKEN_HASH || "";
    const expires = Date.parse(process.env.PRIVATE_REGISTRATION_EXPIRES_AT || "");
    if (!sendMail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !/^[a-f0-9]{64}$/.test(digest) || !Number.isFinite(expires) ||
        expires <= Date.now() || expires > Date.now() + DAY) return null;
    return { email, digest, expires };
  };
  const registrationMode = () => !production || (process.env.ALLOW_REGISTRATION === "true" && sendMail && challenge.ready)
    ? "public" : privateRegistration() ? "invite" : "closed";
  let maintenanceCache = { at: 0, value: false };
  const maintenance = async (fresh = false) => {
    if (!fresh && Date.now() - maintenanceCache.at < 5000) return maintenanceCache.value;
    const value = !!(await store.one(
      "SELECT id FROM portal_settings WHERE id='maintenance'",
    ));
    maintenanceCache = { at: Date.now(), value };
    return value;
  };
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
      !["/health", "/ready", "/session", "/logout"].includes(req.path) &&
      (await maintenance())
    )
      return res.status(503).json({
        error: "Work in progress. Please check back shortly.",
        maintenance: true,
      });
    next();
  });
  // Keep ordinary JSON requests small; only authenticated document uploads
  // may use the larger parser. Authenticate before buffering a full PDF.
  const smallJson = express.json({ limit: "64kb" }), documentJson = express.json({ limit: "3mb" });
  app.use("/api", async (req, res, next) => {
    if (req.method === "POST" && req.path === "/workspace/documents") {
      const user = await session(req);
      if (!user) return res.status(401).json({ error: "Sign in to access your private workspace." });
      return documentJson(req, res, next);
    }
    return smallJson(req, res, next);
  });
  // Per-client limits. They are only consulted after the security challenge
  // has passed, so unverified junk traffic cannot use anyone's allowance.
  const authLimit = keyedLimit(20, 60000),
    tokenLimit = keyedLimit(20, 60000),
    searchLimit = keyedLimit(30, 60000),
    writeLimit = keyedLimit(120, 60000),
    adminLimit = keyedLimit(60, 60000);
  const lock = keyedLock();
  let swept = 0;
  const sweep = async () => {
    if (Date.now() - swept < 60000) return;
    swept = Date.now();
    await store.run("DELETE FROM `usage` WHERE expires<?", [swept]);
    await store.run("DELETE FROM search_history WHERE created<?", [swept - 30 * DAY]);
    await store.run("DELETE FROM sessions WHERE expires<?", [swept]);
  };
  // Durable fixed-window ceilings; database uniqueness and conditional writes
  // enforce the limits across workers and application restarts.
  async function budget(scope, max, window = DAY) {
    const now = Date.now(), bucket = Math.floor(now / window);
    const key = `budget:${scope}:${bucket}`;
    await sweep();
    const update = () => store.run("UPDATE `usage` SET n=n+1 WHERE id=? AND n<?", [key, max]);
    if ((await update()).changes) return true;
    try {
      await store.run("INSERT INTO `usage`(id,n,expires) VALUES(?,?,?)", [key, 1, (bucket + 1) * window]);
      return true;
    } catch (error) {
      if (!/unique|duplicate/i.test(error.message)) throw error;
      return !!(await update()).changes;
    }
  }
  // Atomic daily allowance: claims up to `units` from a per-key counter with a
  // compare-and-set update, so it is correct across processes without a lock.
  // Returns the units left after the claim and how many were claimed, or
  // left=-1 when the allowance is already used up.
  async function claim(id, max, units = 1) {
    const day = Math.floor(Date.now() / DAY),
      key = `${id}:${day}`;
    await sweep();
    for (let attempt = 0; attempt < 8; attempt++) {
      const r = await store.one("SELECT n FROM `usage` WHERE id=?", [key]),
        n = Number(r?.n || 0);
      if (n >= max) return { left: -1, used: 0 };
      if (units <= 0) return { left: max - n, used: 0 };
      const used = Math.min(units, max - n);
      if (r) {
        if ((await store.run("UPDATE `usage` SET n=n+? WHERE id=? AND n=?", [used, key, n])).changes)
          return { left: max - n - used, used };
      } else {
        try {
          await store.run("INSERT INTO `usage`(id,n,expires) VALUES(?,?,?)", [key, used, (day + 1) * DAY]);
          return { left: max - used, used };
        } catch (error) {
          if (!/unique|duplicate/i.test(error.message)) throw error;
        }
      }
    }
    return { left: -1, used: 0 };
  }
  async function quota(id, max, units = 1) {
    return (await claim(id, max, units)).left;
  }
  async function refund(id, units = 1, window = DAY) {
    if (units <= 0) return;
    const key = `${id}:${Math.floor(Date.now() / window)}`;
    await store.run("UPDATE `usage` SET n=CASE WHEN n>? THEN n-? ELSE 0 END WHERE id=?", [units, units, key]);
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
    return t;
  }
  async function emailToken(user, kind) {
    if (!sendMail) return;
    if (!(await budget("transactional-mail", 100))) throw Error("Email capacity reached");
    const token = randomBytes(32).toString("hex");
    await lock("account:" + user.id, () => store.transaction(async () => {
      if (!(await store.lockAccount(user.id))) throw Error("Account unavailable");
      await store.run(
        "DELETE FROM email_tokens WHERE (owner=? AND kind=?) OR expires<?",
        [user.id, kind, Date.now()],
      );
      await store.run(
        "INSERT INTO email_tokens(digest,owner,kind,expires) VALUES(?,?,?,?)",
        [hash(token), user.id, kind, Date.now() + 1800000],
      );
    }));
    await sendMail(user.email, kind, token);
  }
  app.post("/api/email-request", async (req, res) => {
    if (!(await challengeGate(req, res, "recovery"))) return;
    if (!authLimit(client(req)))
      return res.status(429).json({ error: "Try again later." });
    if (!sendMail)
      return res
        .status(503)
        .json({ error: "Email delivery is not configured." });
    const kind = req.body.kind === "verify" ? "verify" : "reset",
      email = text(req.body.email, 254).toLowerCase();
    if (!(await budget("mail:" + emailDigest(email), 3)))
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
    // Tokens are 256-bit random values, so guessing is not practical; the
    // per-client limit only stops one client from hammering the endpoint.
    if (!tokenLimit(client(req)))
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
    const pending = await store.one(
      "SELECT owner FROM email_tokens WHERE digest=? AND kind=? AND expires>?",
      [hash(raw), kind, Date.now()],
    );
    if (!pending)
      return res.status(400).json({ error: "Link expired or invalid." });
    // Hash the new password only for a valid link (scrypt is deliberately slow).
    const password = kind === "reset" ? await passwordHash(p) : null;
    const completed = await lock("account:" + pending.owner, () => store.transaction(async () => {
      if (!(await store.lockAccount(pending.owner))) return false;
      // Single use: only the request that deletes the token may continue.
      const claimed = await store.run(
        "DELETE FROM email_tokens WHERE digest=? AND kind=? AND expires>?",
        [hash(raw), kind, Date.now()],
      );
      if (!claimed.changes) return false;
      const row = pending;
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
        // Any other outstanding links for this account are now stale.
        await store.run("DELETE FROM email_tokens WHERE owner=?", [row.owner]);
      }
      return true;
    }));
    if (!completed) return res.status(400).json({ error: "Link expired or invalid." });
    res.json({ ok: true, kind });
  });
  app.get("/api/health", (req, res) =>
    res.json({ ok: true, version: "4.1.1" }),
  );
  app.get("/api/ready", async (req, res) => {
    try { await store.one("SELECT 1 AS ready"); res.json({ ok: true }); }
    catch { res.status(503).json({ ok: false }); }
  });
  app.get("/api/session", async (req, res) =>
    res.json({
      user: (await session(req)) || null,
      maintenance: await maintenance(),
      registrationMode: registrationMode(),
      turnstileSiteKey: challenge.sitekey,
      assistantAvailable: !!(
        process.env.OPENROUTER_API_KEY &&
        process.env.OPENROUTER_MODEL?.endsWith(":free")
      ),
    }),
  );
  app.post("/api/register", async (req, res) => {
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
    const mode = registrationMode();
    const invite = mode === "invite" ? privateRegistration() : null;
    const code = req.body.invitationCode;
    if (mode !== "public" && (!invite || email !== invite.email ||
        typeof code !== "string" || !/^[a-f0-9]{64}$/.test(code) ||
        !equal(Buffer.from(hash(code)), Buffer.from(invite.digest))))
      return res.status(403).json({ error: "Registration is not open yet. A valid private invitation is required." });
    if (!(await challengeGate(req, res, "signup"))) return;
    if (!authLimit(client(req)))
      return res.status(429).json({ error: "Try again later." });
    if (production && req.body.privacyAccepted !== true)
      return res.status(400).json({ error: "Please acknowledge the Quarrix privacy notice." });
    if (production && !(await budget("registration", 25)))
      return res.status(429).json({ error: "Daily registration capacity reached. Please try tomorrow." });
    const id = randomUUID(),
      encoded = await passwordHash(password);
    const maxAccounts = Math.max(
      1,
      Math.min(5000, Number(process.env.MAX_ACCOUNTS) || 500),
    );
    try {
      const created = await lock("registration", () => store.transaction(async () => {
        await store.lockRegistration();
        if (
          Number((await store.one("SELECT COUNT(*) AS n FROM accounts")).n) >=
          maxAccounts
        )
          return false;
        if (invite) {
          if (invite.expires <= Date.now()) return false;
          // A unique, durable claim prevents invitation replay across processes.
          // Fail closed if account creation later fails; issue a new invitation.
          await store.run("INSERT INTO registration_invite_uses(digest,created) VALUES(?,?)", [invite.digest, Date.now()]);
        }
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
        if (req.body.privacyAccepted === true) {
          try {
            await store.run("INSERT INTO privacy_acknowledgements(owner,version,created) VALUES(?,?,?)", [id, PRIVACY_VERSION, Date.now()]);
          } catch (error) {
            // No verification email or session has been issued at this point.
            await store.run("DELETE FROM accounts WHERE id=?", [id]);
            throw error;
          }
        }
        return true;
      }));
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
    cookie(res, await signIn(req, res, id), 7 * DAY);
    res.status(201).json({ user: { id, email } });
  });
  app.post("/api/login", async (req, res) => {
    if (!(await challengeGate(req, res, "login"))) return;
    if (!authLimit(client(req)))
      return res.status(429).json({ error: "Try again later." });
    const email = text(req.body.email, 254).toLowerCase(),
      password = req.body.password;
    if (typeof password !== "string" || password.length > 128)
      return res.status(400).json({ error: "Invalid credentials." });
    if (production && (!(await budget("login-global", envInt("LOGIN_ATTEMPTS_PER_15_MIN", 1000), 900000)) ||
        !(await budget("login:" + emailDigest(email), 10, 900000))))
      return res.status(429).json({ error: "Too many sign-in attempts. Try again later." });
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
    const sessionToken = await lock("account:" + user.id, () => store.transaction(async () => {
      if (!(await store.lockAccount(user.id))) return null;
      const current = await store.one("SELECT password_hash FROM accounts WHERE id=?", [user.id]);
      if (!current || current.password_hash !== expected || await store.one("SELECT owner FROM suspended WHERE owner=?", [user.id])) return null;
      return signIn(req, res, user.id);
    }));
    if (!sessionToken) return res.status(401).json({ error: "Invalid credentials." });
    cookie(res, sessionToken, 7 * DAY);
    res.json({ user: { id: user.id, email: decodeEmail(user).email } });
  });
  app.post("/api/logout", async (req, res) => {
    const t = token(req);
    if (t) await store.run("DELETE FROM sessions WHERE digest=?", [hash(t)]);
    cookie(res, "", 0);
    res.json({ ok: true });
  });
  const GUEST_SEARCHES = 5,
    GUEST_RESULTS = 10,
    MEMBER_SEARCHES = 50;
  app.post("/api/discover", async (req, res) => {
    const kind = text(req.body.kind, 20),
      q = text(req.body.q, 100),
      location = text(req.body.location, 100);
    if (!q || !["jobs", "grants", "business"].includes(kind))
      return res.status(400).json({ error: "Enter a valid query." });
    const user = await session(req);
    // Guests must pass the security check before anything is counted.
    if (!user && !(await challengeGate(req, res, "guest_search"))) return;
    if (!searchLimit(user ? "user:" + user.id : client(req)))
      return res
        .status(429)
        .json({ error: "You are searching very quickly. Please wait a moment." });
    const signGuest = id => createHmac("sha256", dataKey).update("guest:" + id).digest("hex");
    const guestCookie = (req.get("cookie") || "").match(
      /(?:^|;\s*)quarrix_guest=([a-f0-9]{32})\.([a-f0-9]{64})(?:;|$)/,
    );
    let guest = guestCookie && equal(Buffer.from(signGuest(guestCookie[1])), Buffer.from(guestCookie[2])) ? guestCookie[1] : null;
    if (!user && !guest) {
      guest = randomBytes(16).toString("hex");
      res.cookie("quarrix_guest", guest + "." + signGuest(guest), {
        httpOnly: true,
        sameSite: "lax",
        secure: production,
        maxAge: 30 * DAY,
        path: "/",
      });
    }
    const day = Math.floor(Date.now() / DAY),
      personal = user ? "search:" + user.id : "guest:" + hash(guest),
      resultsKey = `guest-results:${hash(guest || "")}`;
    if (!user) {
      const used = await store.one("SELECT n FROM `usage` WHERE id=?", [`${resultsKey}:${day}`]);
      if (Number(used?.n || 0) >= GUEST_RESULTS)
        return res.status(429).json({
          error: "Your ten free guest results are used. Create a free account to continue.",
          registrationRequired: true,
        });
    }
    // Personal allowance first, so a client that is already out of searches
    // never touches the shared daily capacity.
    const remaining = await quota(personal, user ? MEMBER_SEARCHES : GUEST_SEARCHES);
    if (remaining < 0)
      return res.status(429).json({
        error: user
          ? "Daily search limit reached."
          : "Your five guest searches are used. Create a free account to continue.",
        registrationRequired: !user,
      });
    const scope = user ? "member-search" : "guest-search";
    // Once the trusted proxy topology is explicitly configured, apply a durable
    // visitor allowance in addition to the browser quota. Avoid treating a
    // shared proxy socket as a single visitor before deployment is validated.
    if (production && !user && hops && !(await budget("guest-ip:" + hash(client(req)), 30))) {
      await refund(personal);
      return res.status(429).json({ error: "Daily visitor search capacity reached." });
    }
    if (
      production &&
      !(await budget(scope, user ? envInt("MEMBER_SEARCHES_PER_DAY", 2000) : envInt("GUEST_SEARCHES_PER_DAY", 250)))
    ) {
      await refund(personal);
      return res.status(429).json({ error: "Daily search capacity reached. Please try tomorrow." });
    }
    let result;
    try {
      result = await search(kind, q, location);
    } catch {
      result = { rows: [], status: "unavailable" };
    }
    // A search that could not reach its source is not charged.
    const charged = !(result.rows.length === 0 && ["busy", "unavailable"].includes(result.status));
    if (!charged) {
      await refund(personal);
      if (production) {
        await refund("budget:" + scope);
        if (!user && hops) await refund("budget:guest-ip:" + hash(client(req)));
      }
    }
    const left = charged ? remaining : remaining + 1;
    if (user) {
      const id = randomUUID();
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
        remaining: left,
        rows: result.rows.slice(0, 50),
        limited: false,
      });
    }
    const allowance = await claim(resultsKey, GUEST_RESULTS, result.rows.length);
    const shown = Math.max(0, allowance.used);
    if (!shown && result.rows.length)
      return res.status(429).json({
        error: "Your ten free guest results are used. Create a free account to continue.",
        registrationRequired: true,
      });
    res.json({
      ...result,
      remaining: left,
      guestResultsLeft: Math.max(0, allowance.left),
      rows: result.rows.slice(0, shown),
      limited: result.rows.length > shown,
    });
  });
  app.use("/api/workspace", requireUser, (req, res, next) => {
    if (!["GET", "HEAD"].includes(req.method) && !writeLimit(req.user.id))
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
  const history = async (owner) => {
    return (
      await store.all(
        "SELECT id,body,created FROM search_history WHERE owner=? AND created>? ORDER BY created DESC LIMIT 50",
        [owner, Date.now() - 30 * DAY],
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
    await lock("account:" + req.user.id, () => store.transaction(async () => {
      if (!(await store.lockAccount(req.user.id))) throw Error("Account unavailable");
      await store.run("DELETE FROM support_grants WHERE owner=?", [
        req.user.id,
      ]);
      if (expires)
        await store.run(
          "INSERT INTO support_grants(owner,expires) VALUES(?,?)",
          [req.user.id, expires],
        );
    }));
    res.json({ expires });
  });
  app.put("/api/workspace/newsletter", async (req, res) => {
    if (typeof req.body.subscribed !== "boolean")
      return res.status(400).json({ error: "Choose a newsletter preference." });
    await lock("account:" + req.user.id, async () => {
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
    const createdRecord = await lock("account:" + req.user.id, () => store.transaction(async () => {
      if (!(await store.lockAccount(owner))) return false;
      if (
        Number(
          (
            await store.one("SELECT COUNT(*) AS n FROM records WHERE owner=?", [
              owner,
            ])
          ).n,
        ) >= 500
      )
        return false;
      await store.run(
        "INSERT INTO records(id,owner,kind,body,updated) VALUES(?,?,?,?,?)",
        [id, owner, body.kind, sealRecord(body, owner, id), Date.now()],
      );
      return true;
    }));
    if (!createdRecord) return res.status(409).json({ error: "Workspace record limit reached." });
    res.status(201).json({ id, ...body });
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
    if (production && !scanPdf) return res.status(503).json({ error: "Secure document uploads are temporarily unavailable." });
    if (scanPdf) {
      try { if (!(await scanPdf(bytes))) return res.status(422).json({ error: "Document rejected by security screening." }); }
      catch { return res.status(503).json({ error: "Document security screening is temporarily unavailable." }); }
    }
    const createdDocument = await lock("account:" + req.user.id, () => store.transaction(async () => {
      if (!(await store.lockAccount(req.user.id))) return null;
      const owner = req.user.id,
        used = await store.one(
          "SELECT COUNT(*) AS n,COALESCE(SUM(bytes),0) AS total FROM documents WHERE owner=?",
          [owner],
        );
      if (
        Number(used.n) >= 10 ||
        Number(used.total) + bytes.length > 10_000_000
      )
        return null;
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
      return { id, name, mime, bytes: bytes.length };
    }));
    if (!createdDocument) return res.status(409).json({ error: "10 MB workspace document limit reached." });
    res.status(201).json(createdDocument);
  });
  app.get("/api/workspace/documents/:id", async (req, res) => {
    const doc = await store.one(
      "SELECT name,content FROM documents WHERE id=? AND owner=?",
      [req.params.id, req.user.id],
    );
    if (!doc) return res.status(404).json({ error: "Document not found." });
    const bytes = encryption.open(doc.content, req.user.id + ":" + req.params.id);
    if (!(await screenDownload(bytes, res))) return;
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
      .send(bytes);
  });
  async function screenDownload(bytes, res) {
    // Legacy attachments have no scan evidence. Retain them encrypted, but
    // never deliver their contents in production until screening succeeds.
    if (production && !scanPdf) {
      res.status(503).json({ error: "Secure document downloads are temporarily unavailable." });
      return false;
    }
    if (scanPdf) {
      try {
        if (await scanPdf(bytes)) return true;
        res.status(422).json({ error: "Document quarantined by security screening." });
      } catch {
        res.status(503).json({ error: "Document security screening is temporarily unavailable." });
      }
      return false;
    }
    return true;
  }
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
    const deleted = await lock("account:" + req.user.id, () => store.transaction(async () => {
      if (!(await store.lockAccount(req.user.id))) return false;
      const current = await store.one("SELECT password_hash FROM accounts WHERE id=?", [req.user.id]);
      if (!current || current.password_hash !== u.password_hash) return false;
      await store.run("DELETE FROM accounts WHERE id=?", [req.user.id]);
      return true;
    }));
    if (!deleted) return res.status(401).json({ error: "Invalid credentials." });
    cookie(res, "", 0);
    res.json({ ok: true });
  });
  app.get("/api/admin/audit", async (req, res) => {
    if (!adminAuth(req)) return res.status(403).json({ error: "Forbidden." });
    if (!adminLimit("admin")) return res.status(429).json({ error: "Try later." });
    res.json({
      events: await store.all(
        "SELECT action,target,created FROM admin_audit ORDER BY created DESC LIMIT 100",
      ),
    });
  });
  app.get("/api/admin/support/:id", async (req, res) => {
    if (!adminAuth(req)) return res.status(403).json({ error: "Forbidden." });
    if (!adminLimit("admin")) return res.status(429).json({ error: "Try later." });
    const owner = req.params.id;
    const data = await store.transaction(async () => {
    if (!(await store.lockAccount(owner)) ||
      !(await store.one(
        "SELECT owner FROM support_grants WHERE owner=? AND expires>?",
        [owner, Date.now()],
      ))
    )
      return null;
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
    return { records, documents, history: await history(owner) };
    });
    if (!data) return res.status(403).json({ error: "User has not authorized support access." });
    res.json(data);
  });
  app.get("/api/admin/support/:id/document/:doc", async (req, res) => {
    if (!adminAuth(req)) return res.status(403).json({ error: "Forbidden." });
    if (!adminLimit("admin")) return res.status(429).json({ error: "Try later." });
    const owner = req.params.id,
      doc = req.params.doc;
    const access = await store.transaction(async () => {
    if (!(await store.lockAccount(owner)) ||
      !(await store.one(
        "SELECT owner FROM support_grants WHERE owner=? AND expires>?",
        [owner, Date.now()],
      ))
    )
      return { status: 403 };
    const item = await store.one(
      "SELECT name,content FROM documents WHERE owner=? AND id=?",
      [owner, doc],
    );
    if (!item) return { status: 404 };
    await store.run(
      "INSERT INTO admin_audit(id,action,target,created) VALUES(?,?,?,?)",
      [randomUUID(), "support-download-attempt", doc, Date.now()],
    );
    return { status: 200, item };
    });
    if (access.status !== 200) return res.status(access.status).json({ error: access.status === 403 ? "User has not authorized support access." : "Document not found." });
    const item = access.item;
    const bytes = encryption.open(item.content, owner + ":" + doc);
    if (!(await screenDownload(bytes, res))) return;
    // Screening is potentially slow. Recheck authorization after it completes.
    const stillAuthorized = await store.transaction(async () => {
      if (!(await store.lockAccount(owner)) || !(await store.one(
        "SELECT owner FROM support_grants WHERE owner=? AND expires>?", [owner, Date.now()]
      )) || !(await store.one("SELECT id FROM documents WHERE owner=? AND id=?", [owner, doc]))) return false;
      await store.run("INSERT INTO admin_audit(id,action,target,created) VALUES(?,?,?,?)", [randomUUID(), "support-download", doc, Date.now()]);
      return true;
    });
    if (!stillAuthorized) return res.status(403).json({ error: "User has not authorized support access." });
    res
      .attachment(
        encryption
          .open(Buffer.from(item.name, "base64"), owner + ":" + doc + ":name")
          .toString(),
      )
      .type("application/octet-stream")
      .send(bytes);
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
    if (!adminLimit("admin")) return res.status(429).json({ error: "Try later." });
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
    if (!adminLimit("admin")) return res.status(429).json({ error: "Try later." });
    const action = req.body.action,
      id = text(req.body.id, 36);
    if (
      !["suspend", "restore", "maintenance-on", "maintenance-off"].includes(
        action,
      )
    )
      return res.status(400).json({ error: "Invalid action." });
    const changed = await lock("admin", () => store.transaction(async () => {
      if (action.startsWith("maintenance")) {
        if (action === "maintenance-on") {
          if (!(await maintenance(true)))
            await store.run(
              "INSERT INTO portal_settings(id,value) VALUES('maintenance','on')",
            );
        } else
          await store.run("DELETE FROM portal_settings WHERE id='maintenance'");
      } else {
        if (!(await store.lockAccount(id))) return false;
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
      return true;
    }));
    maintenanceCache.at = 0;
    if (!changed) return res.status(404).json({ error: "Account not found." });
    res.json({ ok: true });
  });
  app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));
  // Hashed build assets never change, so browsers may keep them for a year;
  // everything else is revalidated so a deploy is visible immediately.
  app.use(
    express.static(dist, {
      index: false,
      dotfiles: "deny",
      setHeaders(res, file) {
        res.set(
          "Cache-Control",
          /[\\/]assets[\\/]/.test(file)
            ? "public, max-age=31536000, immutable"
            : "public, max-age=3600",
        );
      },
    }),
  );
  let shell = null;
  const page = () => {
    if (shell === null) {
      try {
        shell = readFileSync(resolve(dist, "index.html"), "utf8");
      } catch {
        shell = "";
      }
    }
    return shell;
  };
  // The app routes inside the page. "/" is the app; any other page address
  // gets the same branded shell with a real 404 status, which shows a
  // "page not found" view. Missing files (an extension) get a plain 404.
  app.get(/.*/, (req, res, next) => {
    if (!page()) return next();
    res.set("Cache-Control", "no-cache");
    if (extname(req.path) && req.path !== "/index.html")
      return res.status(404).type("text/plain").send("Not found");
    res.status(req.path === "/" || req.path === "/index.html" ? 200 : 404).type("html").send(page());
  });
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (production && (!err.status || err.status >= 500)) console.error(JSON.stringify({ event: "request_failed", type: err.timeout ? "timeout" : "internal", method: req.method }));
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
