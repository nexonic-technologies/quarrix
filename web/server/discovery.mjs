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
// Shared cache and one in-flight request per provider. No retry on access denial or throttling.
async function cached(provider, key, fn, ttl = 3600_000) {
  const id = provider + ":" + key,
    old = cache.get(id),
    now = Date.now();
  if (old && now - old.at < ttl)
    return { rows: old.rows, checkedAt: old.at, status: "cached" };
  if (pending.has(id)) return pending.get(id);
  if (
    pending.size >= 4 ||
    [...pending.keys()].some((k) => k.startsWith(provider + ":")) ||
    now - (last.get(provider) || 0) < 2000
  )
    return {
      rows: old?.rows || [],
      checkedAt: old?.at || null,
      status: old ? "stale" : "busy",
    };
  last.set(provider, now);
  const work = (async () => {
    try {
      const rows = await fn();
      const at = Date.now();
      if (cache.size >= 200) cache.delete(cache.keys().next().value);
      cache.set(id, { rows, at });
      return { rows, checkedAt: at, status: "live" };
    } catch (e) {
      if (e.status === 403) last.set(provider, Infinity);
      else if (e.status === 429)
        last.set(provider, Math.max(Date.now() + 600_000, e.retryAt || 0));
      return {
        rows: old?.rows || [],
        checkedAt: old?.at || null,
        status: old ? "stale" : "unavailable",
        message: "Source is temporarily unavailable; no results are invented.",
      };
    } finally {
      pending.delete(id);
    }
  })();
  pending.set(id, work);
  return work;
}
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
    const feeds = await Promise.all([
      cached("Jobicy", "feed", async () => {
        const j = await json("https://jobicy.com/api/v2/remote-jobs?count=100");
        if (!Array.isArray(j.jobs)) throw Error("Invalid response");
        return j.jobs.map((x) =>
          result(
            "Jobicy",
            x.jobTitle,
            `${x.companyName || ""} · ${x.jobGeo || "Remote"}`,
            x.url,
            x.jobIndustry?.join?.(", ") || "",
            x.pubDate,
          ),
        );
      }),
      cached("Arbeitnow", "feed", async () => {
        const j = await json("https://www.arbeitnow.com/api/job-board-api");
        if (!Array.isArray(j.data)) throw Error("Invalid response");
        return j.data.map((x) =>
          result(
            "Arbeitnow",
            x.title,
            `${x.company_name || ""} · ${x.location || ""}${x.remote ? " · Remote" : ""}`,
            x.url,
            x.tags?.join?.(", ") || "",
            Number.isFinite(x.created_at)
              ? new Date(x.created_at * 1000).toISOString()
              : "",
          ),
        );
      }),
    ]);
    const good = feeds.filter((f) => ["live", "cached"].includes(f.status)),
      status =
        good.length === 2
          ? good.every((f) => f.status === "cached")
            ? "cached"
            : "live"
          : good.length
            ? "partial"
            : feeds.some((f) => f.rows.length)
              ? "stale"
              : "unavailable";
    const rows = feeds
      .flatMap((f) => f.rows)
      .filter(
        (r) =>
          r.url &&
          `${r.title} ${r.subtitle} ${r.detail}`
            .toLowerCase()
            .includes(q.toLowerCase()) &&
          (!place || r.subtitle.toLowerCase().includes(place.toLowerCase())),
      );
    return {
      rows: [...new Map(rows.map((r) => [r.url, r])).values()],
      status,
      checkedAt: Math.max(...feeds.map((f) => f.checkedAt || 0)) || null,
      providers: feeds.map((f, i) => ({
        name: i ? "Arbeitnow" : "Jobicy",
        status: f.status,
        checkedAt: f.checkedAt,
      })),
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
            x.number,
            x.closeDate,
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
