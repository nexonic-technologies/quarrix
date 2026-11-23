const cache = new Map(),
  pending = new Map(),
  last = new Map();
const UA =
  "Quarrix Web/4.0 (https://nexonictechnologies.com; info@nexonictechnologies.com)";
const clean = (v, n = 200) =>
  typeof v === "string" ? v.trim().slice(0, n) : "";
export function webUrl(v) {
  try {
    const u = new URL(v);
    return ["http:", "https:"].includes(u.protocol) &&
      !u.username &&
      !u.password
      ? u.href
      : "";
  } catch {
    return "";
  }
}
async function json(url, options = {}) {
  const r = await fetch(url, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(12000),
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      ...options.headers,
    },
  });
  if (!r.ok) {
    const e = new Error(`Provider returned HTTP ${r.status}`);
    e.status = r.status;
    const retry = r.headers.get("retry-after");
    e.retryAt = retry
      ? Number.isFinite(Number(retry))
        ? Date.now() + Number(retry) * 1000
        : Date.parse(retry)
      : 0;
    throw e;
  }
  const reader = r.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 3_000_000) throw Error("Provider response too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
// Shared cache, with bounded concurrency per provider. Requests wait briefly
// for a free slot instead of failing, identical requests share one fetch, and
// a provider that throttles or refuses access is backed off for a while.
const PER_PROVIDER = 2,
  TOTAL = 6,
  SPACING = 400,
  WAIT = 8000;
const active = new Map();
let activeTotal = 0;
const waiters = [];
function wake() {
  for (let i = 0; i < waiters.length; i++) {
    const w = waiters[i];
    if (activeTotal < TOTAL && (active.get(w.provider) || 0) < PER_PROVIDER) {
      waiters.splice(i, 1);
      clearTimeout(w.timer);
      w.resolve(true);
      i--;
    }
  }
}
function acquire(provider) {
  if (activeTotal < TOTAL && (active.get(provider) || 0) < PER_PROVIDER && !waiters.length)
    return Promise.resolve(true);
  return new Promise((resolve) => {
    const w = { provider, resolve };
    w.timer = setTimeout(() => {
      const i = waiters.indexOf(w);
      if (i >= 0) waiters.splice(i, 1);
      resolve(false);
    }, WAIT);
    if (waiters.length >= 100) {
      clearTimeout(w.timer);
      return resolve(false);
    }
    waiters.push(w);
  });
}
async function slot(provider, fn) {
  if (!(await acquire(provider))) return { skipped: true };
  activeTotal++;
  active.set(provider, (active.get(provider) || 0) + 1);
  try {
    // Keep a small gap between calls to the same provider.
    const gap = (last.get(provider) || 0) + SPACING - Date.now();
    if (gap > 0) await new Promise((r) => setTimeout(r, gap));
    last.set(provider, Date.now());
    return { value: await fn() };
  } finally {
    activeTotal--;
    active.set(provider, active.get(provider) - 1);
    wake();
  }
}
const backoff = new Map();
async function cached(provider, key, fn, ttl = 3600_000) {
  const id = provider + ":" + key,
    old = cache.get(id),
    now = Date.now();
  if (old && now - old.at < ttl)
    return { rows: old.rows, checkedAt: old.at, status: "cached" };
  if (pending.has(id)) return pending.get(id);
  const fallback = (status, message) => ({
    rows: old?.rows || [],
    checkedAt: old?.at || null,
    status: old ? "stale" : status,
    ...(message ? { message } : {}),
  });
  if ((backoff.get(provider) || 0) > now)
    return fallback("unavailable", "Source is temporarily unavailable; no results are invented.");
  const work = (async () => {
    try {
      const run = await slot(provider, fn);
      if (run.skipped) return fallback("busy", "Source is busy; please try again in a moment.");
      const at = Date.now();
      if (cache.size >= 300) cache.delete(cache.keys().next().value);
      cache.set(id, { rows: run.value, at });
      return { rows: run.value, checkedAt: at, status: "live" };
    } catch (e) {
      if (e.status === 403 || e.status === 401) backoff.set(provider, Date.now() + 3600_000);
      else if (e.status === 429)
        backoff.set(provider, Math.max(Date.now() + 600_000, e.retryAt || 0));
      else if (e.status >= 500) backoff.set(provider, Date.now() + 60_000);
      return fallback("unavailable", "Source is temporarily unavailable; no results are invented.");
    } finally {
      pending.delete(id);
    }
  })();
  pending.set(id, work);
  return work;
}
// Search text: case- and accent-insensitive words.
const fold = (v) =>
  String(v || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const words = (v) => fold(v).split(/[^\p{L}\p{N}+#.]+/u).map((w) => w.replace(/^\.+|\.+$/g, "")).filter(Boolean);
const STOP = new Set(["and", "or", "the", "a", "an", "of", "in", "for", "to", "with", "job", "jobs", "role", "roles"]);
// Every meaningful query word must appear (as a word or word prefix)
// somewhere in the listing; title matches rank first.
export function match(query, row) {
  const terms = words(query).filter((w) => !STOP.has(w));
  if (!terms.length) return 0;
  const title = words(row.title),
    rest = words(`${row.subtitle} ${row.detail}`);
  const has = (list, t) => list.some((w) => w === t || (t.length >= 3 && w.startsWith(t)));
  let score = 0;
  for (const t of terms) {
    if (has(title, t)) score += 3;
    else if (has(rest, t)) score += 1;
    else return 0;
  }
  return score;
}
export function inRegion(place, row) {
  const terms = words(place);
  if (!terms.length) return true;
  const text = words(row.subtitle);
  if (terms.length === 1 && ["worldwide", "anywhere", "global", "remote"].includes(terms[0]))
    return text.some((w) => ["remote", "worldwide", "anywhere"].includes(w));
  return terms.every((t) => text.some((w) => w === t || (t.length >= 3 && w.startsWith(t))));
}
const isoDate = (v) => {
  const t = typeof v === "number" ? v * 1000 : Date.parse(String(v || "").replace(" ", "T"));
  return Number.isFinite(t) && t > 0 ? new Date(t).toISOString() : "";
};
const result = (source, title, subtitle, url, detail = "", date = "") => ({
  source,
  title: clean(title),
  subtitle: clean(subtitle),
  url: webUrl(url),
  detail: clean(detail, 300),
  date: clean(date, 40),
});
export async function discover(kind, query, location = "") {
  const q = clean(query, 100),
    place = clean(location, 100);
  if (!q) throw Error("Enter a search term.");
  if (kind === "jobs") {
    const jobicy = (j) => {
      if (!Array.isArray(j.jobs)) throw Error("Invalid response");
      return j.jobs.map((x) =>
        result(
          "Jobicy",
          x.jobTitle,
          `${x.companyName || ""} · ${x.jobGeo || "Anywhere"} · Remote`,
          x.url,
          [x.jobIndustry?.join?.(", "), x.jobType?.join?.(", "), x.jobExcerpt].filter(Boolean).join(" · "),
          isoDate(x.pubDate),
        ),
      );
    };
    const tag = words(q).filter((w) => !STOP.has(w)).join(" ");
    const feeds = await Promise.all([
      // Jobicy's latest listings plus its own keyword search for this query.
      cached("Jobicy", "feed", async () =>
        jobicy(await json("https://jobicy.com/api/v2/remote-jobs?count=100")),
      ),
      tag
        ? cached("Jobicy", "tag:" + tag, async () =>
            jobicy(await json("https://jobicy.com/api/v2/remote-jobs?count=50&tag=" + encodeURIComponent(tag))),
          )
        : Promise.resolve({ rows: [], status: "cached", checkedAt: null }),
      cached("Arbeitnow", "feed", async () => {
        const rows = [];
        for (let page = 1; page <= 3; page++) {
          const j = await json("https://www.arbeitnow.com/api/job-board-api?page=" + page);
          if (!Array.isArray(j.data)) throw Error("Invalid response");
          rows.push(
            ...j.data.map((x) =>
              result(
                "Arbeitnow",
                x.title,
                `${x.company_name || ""} · ${x.location || ""}${x.remote ? " · Remote" : ""}`,
                x.url,
                x.tags?.join?.(", ") || "",
                isoDate(x.created_at),
              ),
            ),
          );
          if (!j.links?.next) break;
        }
        return rows;
      }),
    ]);
    const providers = [
      // The keyword feed only adds coverage; the main feed decides the status.
      { name: "Jobicy", status: feeds[0].status, checkedAt: feeds[0].checkedAt },
      { name: "Arbeitnow", status: feeds[2].status, checkedAt: feeds[2].checkedAt },
    ];
    const good = providers.filter((f) => ["live", "cached"].includes(f.status)),
      status =
        good.length === 2
          ? good.every((f) => f.status === "cached")
            ? "cached"
            : "live"
          : good.length
            ? "partial"
            : feeds.some((f) => f.rows.length)
              ? "stale"
              : providers.some((f) => f.status === "busy")
                ? "busy"
                : "unavailable";
    const scored = [];
    const seen = new Set();
    for (const r of feeds.flatMap((f) => f.rows)) {
      if (!r.url || seen.has(r.url) || !inRegion(place, r)) continue;
      const score = match(q, r);
      if (!score) continue;
      seen.add(r.url);
      scored.push([score, Date.parse(r.date) || 0, r]);
    }
    scored.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    return {
      rows: scored.map((x) => x[2]),
      status,
      checkedAt: Math.max(...feeds.map((f) => f.checkedAt || 0)) || null,
      providers,
    };
  }
  if (kind === "grants")
    return cached("Grants.gov", q.toLowerCase(), async () => {
      const j = await json("https://api.grants.gov/v1/api/search2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: 25,
          keyword: q,
          oppStatuses: "posted",
          startRecordNum: 0,
        }),
      });
      if (j.errorcode !== 0 || !Array.isArray(j.data?.oppHits))
        throw Error("Invalid response");
      return j.data.oppHits
        .filter(
          (x) => x.oppStatus === "posted" && /^\d{1,15}$/.test(String(x.id)),
        )
        .map((x) =>
          result(
            "Grants.gov",
            x.title,
            x.agencyName,
            "https://www.grants.gov/search-results-detail/" + x.id,
            [x.number, x.closeDate ? "Closes " + x.closeDate : ""].filter(Boolean).join(" · "),
            isoDate(x.openDate),
          ),
        );
    });
  if (kind === "business")
    return cached(
      "French public business registry",
      `${q}|${place}`.toLowerCase(),
      async () => {
        const params = new URLSearchParams({
          q: [q, place].filter(Boolean).join(" "),
          per_page: "20",
        });
        const j = await json(
          "https://recherche-entreprises.api.gouv.fr/search?" + params,
        );
        if (!Array.isArray(j.results)) throw Error("Invalid response");
        return j.results
          .filter((x) => /^\d{9}$/.test(x.siren))
          .map((x) =>
            result(
              "French public business registry",
              x.nom_complet,
              x.siege?.adresse,
              "https://annuaire-entreprises.data.gouv.fr/entreprise/" + x.siren,
              x.etat_administratif === "A"
                ? "Active registry record"
                : "Registry status not active",
            ),
          );
      },
    );
  throw Error("Unknown search type.");
}
