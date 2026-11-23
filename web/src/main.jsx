import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource-variable/fraunces/opsz.css";
import "@fontsource-variable/fraunces/opsz-italic.css";
import "./styles.css";
import { Header, ProductBar, Footer, Arrow, External, Icon, SITE } from "./shell.jsx";

const initial = { kind: "business", title: "", notes: "", url: "", status: "" };
const KINDS = {
  jobs: { route: "jobs", label: "Find a job", tab: "Jobs", eyebrow: "Career", heading: "Find remote and European jobs", placeholder: "e.g. react developer", where: "Region (optional)", wherePlaceholder: "e.g. Germany or remote", coverage: "Jobicy remote jobs and Arbeitnow European vacancies. Check each listing for eligibility and location." },
  business: { route: "customers", label: "Find customers", tab: "Customers", eyebrow: "Business", heading: "Find registered businesses", placeholder: "Company or activity", where: "City in France", wherePlaceholder: "e.g. Paris", coverage: "The French public business registry. More regions will be added where data use is permitted." },
  grants: { route: "grants", label: "Find grants", tab: "Grants", eyebrow: "Funding", heading: "Find US public grants", placeholder: "e.g. education", where: "", wherePlaceholder: "", coverage: "Posted Grants.gov opportunities. Always check official eligibility and deadlines." },
};
const ROUTE_KIND = { jobs: "jobs", customers: "business", grants: "grants" };
const ROUTES = new Set(["discover", "jobs", "customers", "grants", "workspace", "sign-in", "create-account", "forgot-password", "desktop", "privacy"]);
const readRoute = () => {
  const r = window.location.hash.replace(/^#\/?/, "").split(/[?#]/)[0];
  return ROUTES.has(r) ? r : "discover";
};
const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
function niceDate(value) {
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return "";
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days >= 0 && days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 14) return `${days} days ago`;
  return dateFormat.format(t);
}
const STATUS = { live: "Live", cached: "Checked recently", partial: "Partly available", stale: "Showing earlier results", busy: "Source busy", unavailable: "Source unavailable" };

let turnstileLoader;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!turnstileLoader)
    turnstileLoader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(Error("Security check unavailable")));
      script.onerror = () => reject(Error("Security check unavailable"));
      document.head.appendChild(script);
    });
  return turnstileLoader;
}
function Turnstile({ sitekey, action }) {
  const container = useRef(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (!sitekey) return;
    let cancelled = false, widget;
    loadTurnstile()
      .then((api) => {
        if (!cancelled && container.current)
          widget = api.render(container.current, {
            sitekey, action, "response-field": true, "response-field-name": "cf-turnstile-response",
            "error-callback": () => setUnavailable(true), callback: () => setUnavailable(false),
          });
      })
      .catch(() => { if (!cancelled) setUnavailable(true); });
    return () => { cancelled = true; if (widget !== undefined) window.turnstile?.remove(widget); };
  }, [sitekey, action]);
  return sitekey ? (
    <div className="qx-check">
      <div ref={container} />
      {unavailable && <p role="status">Security check unavailable. Refresh the page or try again.</p>}
    </div>
  ) : null;
}

function PrivacyText() {
  return (
    <>
      <p>Nexonic Technologies operates Quarrix. We use your email for account access, verification and recovery; newsletters are optional and can be disabled. Passwords are hashed. Private records, document contents and search history are encrypted by the service, but this is not end-to-end encryption.</p>
      <p>Search terms and regions may be sent to external discovery providers. Google Workspace handles transactional email. The optional assistant sends only your submitted question to its configured provider when you explicitly agree. Do not include sensitive personal information in assistant questions.</p>
      <p>The owner can see account and usage metadata. Private records, documents and recent searches are available to support only when you grant temporary access, which expires after one hour and can be revoked. Support access is logged. Search history displays the last 30 days; older entries are removed automatically. You can clear history, export records, download documents, and delete your account in Workspace. Backups may retain deleted information until their retention period expires.</p>
      <p>Essential cookies maintain sessions and guest search allowances. Abuse prevention uses limited account and usage metadata and Cloudflare Turnstile security checks. For privacy questions or deletion support, contact <a href="mailto:quarrix@nexonictechnologies.com">quarrix@nexonictechnologies.com</a>.</p>
    </>
  );
}
function PrivacyNotice() {
  return (
    <details className="qx-privacy">
      <summary>Quarrix privacy notice · 23 November 2026</summary>
      <PrivacyText />
    </details>
  );
}

async function api(path, method = "GET", body) {
  const response = await fetch("/api/" + path, {
    method,
    headers: method === "GET" ? {} : { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
  });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    const e = Error(data.error || "Something went wrong. Please try again.");
    e.data = data;
    throw e;
  }
  return data;
}

function Head({ eyebrow, title, lead, children }) {
  return (
    <div className="nx-head">
      <p className="nx-eyebrow">{eyebrow}</p>
      <h2 className="nx-h2">{title}</h2>
      {lead && <p className="nx-lead">{lead}</p>}
      {children}
    </div>
  );
}

function App() {
  const notFound = !["/", "/index.html"].includes(window.location.pathname);
  const accountRef = useRef(null);
  const searchRef = useRef(null);
  const [emailFlow, setEmailFlow] = useState(() => {
    const match = window.location.hash.match(/^#(verify|reset)=([a-f0-9]{64})$/);
    return match ? { kind: match[1], token: match[2] } : null;
  });
  const [route, setRoute] = useState(() => (emailFlow ? "sign-in" : readRoute()));
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const [assistantAvailable, setAssistantAvailable] = useState(false);
  const [maintenance, setMaintenance] = useState(false);
  const [registrationMode, setRegistrationMode] = useState("closed");
  const [turnstileSiteKey, setTurnstileSiteKey] = useState("");
  const [searchCheck, setSearchCheck] = useState(0);
  const [authCheck, setAuthCheck] = useState(0);
  const [recoveryCheck, setRecoveryCheck] = useState(0);
  const [kind, setKind] = useState(() => ROUTE_KIND[readRoute()] || "jobs");
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [workspace, setWorkspace] = useState({ records: [], documents: [] });
  const [entry, setEntry] = useState(initial);
  const [subscribed, setSubscribed] = useState(false);
  const [answer, setAnswer] = useState("");
  const [support, setSupport] = useState(0);
  const [historyRows, setHistoryRows] = useState([]);
  const say = (text, tone = "info") => setNotice(text ? { text, tone } : null);

  function go(next, { replace = false, signedIn = !!user } = {}) {
    say("");
    if (next === "workspace" && !signedIn) next = "create-account";
    if (ROUTE_KIND[next]) setKind(ROUTE_KIND[next]);
    const hash = next === "discover" ? "#/" : "#/" + next;
    if (window.location.hash !== hash) {
      if (replace) history.replaceState(null, "", hash);
      else history.pushState(null, "", hash);
    }
    setRoute(next);
    if (!ROUTE_KIND[next]) window.scrollTo({ top: 0 });
  }
  useEffect(() => {
    const onHash = () => {
      const r = readRoute();
      setNotice(null);
      setRoute(r);
      if (ROUTE_KIND[r]) setKind(ROUTE_KIND[r]);
      else window.scrollTo({ top: 0 });
    };
    window.addEventListener("popstate", onHash);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("popstate", onHash);
      window.removeEventListener("hashchange", onHash);
    };
  }, []);
  useEffect(() => {
    const titles = { workspace: "Workspace", "sign-in": "Sign in", "create-account": "Create account", "forgot-password": "Account recovery", desktop: "Desktop app", privacy: "Privacy notice", jobs: "Find a job", customers: "Find customers", grants: "Find grants" };
    document.title = notFound ? "Page not found — Quarrix" : (titles[route] ? titles[route] + " — " : "") + "Quarrix by Nexonic Technologies";
  }, [route]);
  useEffect(() => {
    if (ROUTE_KIND[route]) setTimeout(() => searchRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, [route]);

  const fail = (e) => {
    say(e.message, "error");
    if (e.data?.registrationRequired) go("create-account");
    if (e.data?.maintenance) setMaintenance(true);
  };
  useEffect(() => {
    if (emailFlow) history.replaceState(null, "", window.location.pathname + "#/sign-in");
    api("session")
      .then((x) => {
        setUser(x.user);
        setAssistantAvailable(x.assistantAvailable);
        setMaintenance(x.maintenance || false);
        setRegistrationMode(x.registrationMode || "closed");
        setTurnstileSiteKey(x.turnstileSiteKey || "");
      })
      .catch(fail)
      .finally(() => setReady(true));
  }, []);
  async function refresh() {
    if (!user) return;
    const id = user.id;
    try {
      const [w, n, s, h] = await Promise.all([api("workspace"), api("workspace/newsletter"), api("workspace/support"), api("workspace/history")]);
      if (accountRef.current !== id) return;
      setWorkspace(w);
      setSubscribed(n.subscribed);
      setSupport(s.expires);
      setHistoryRows(h.history);
    } catch (e) {
      if (accountRef.current === id) fail(e);
    }
  }
  useEffect(() => {
    accountRef.current = user?.id || null;
    setWorkspace({ records: [], documents: [] });
    setHistoryRows([]);
    setEntry(initial);
    setAnswer("");
    setSupport(0);
    setSubscribed(false);
    if (user) refresh();
  }, [user]);
  useEffect(() => {
    if (ready && route === "workspace" && !user) go("create-account", { replace: true });
  }, [ready, route, user]);

  async function search(e) {
    e.preventDefault();
    const token = new FormData(e.currentTarget).get("cf-turnstile-response");
    setBusy(true);
    say("");
    setResult(null);
    try {
      setResult(await api("discover", "POST", { kind, q: query, location, "cf-turnstile-response": token }));
      setTimeout(() => document.getElementById("qx-results")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      fail(e);
    } finally {
      setSearchCheck((n) => n + 1);
      setBusy(false);
    }
  }
  async function auth(e) {
    e.preventDefault();
    const mode = route === "create-account" ? "register" : "login";
    const f = new FormData(e.target);
    setBusy(true);
    say("");
    try {
      const x = await api(mode, "POST", {
        email: f.get("email"),
        password: f.get("password"),
        newsletter: f.get("newsletter") === "on",
        invitationCode: f.get("invitationCode") || undefined,
        privacyAccepted: f.get("privacyAccepted") === "on",
        "cf-turnstile-response": f.get("cf-turnstile-response"),
      });
      if (x.verificationRequired) {
        go("sign-in");
        say(x.message, "success");
        return;
      }
      setUser(x.user);
      go("workspace", { signedIn: true });
    } catch (e) {
      fail(e);
    } finally {
      setAuthCheck((n) => n + 1);
      setBusy(false);
    }
  }
  async function recover(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const f = new FormData(e.target);
      const r = await api("email-request", "POST", { email: f.get("email"), kind: f.get("kind"), "cf-turnstile-response": f.get("cf-turnstile-response") });
      say(r.message, "success");
    } catch (e) {
      fail(e);
    } finally {
      setRecoveryCheck((n) => n + 1);
      setBusy(false);
    }
  }
  async function completeEmail(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("email-complete", "POST", { ...emailFlow, password: new FormData(e.target).get("password") });
      const done = emailFlow.kind === "reset" ? "Password updated. Sign in with your new password." : "Email verified. You can now sign in.";
      setEmailFlow(null);
      say(done, "success");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function save(r) {
    if (!user) return go("create-account");
    try {
      await api("workspace/records", "POST", { kind: "opportunity", title: r.title, notes: `${r.source} · ${r.subtitle}`, url: r.url, status: "Saved" });
      say("Saved to your workspace.", "success");
      refresh();
    } catch (e) {
      fail(e);
    }
  }
  async function record(e) {
    e.preventDefault();
    try {
      await api("workspace/records" + (entry.id ? "/" + entry.id : ""), entry.id ? "PUT" : "POST", entry);
      setEntry(initial);
      refresh();
      say("Workspace updated.", "success");
    } catch (e) {
      fail(e);
    }
  }
  async function upload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) return say("PDF must be under 2 MB.", "error");
    setBusy(true);
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await api("workspace/documents", "POST", { name: file.name, content: data });
      refresh();
      say("Document uploaded privately.", "success");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }
  async function remove(type, id) {
    if (!confirm("Remove this item from your workspace?")) return;
    try {
      await api(`workspace/${type}/${id}`, "DELETE");
      refresh();
    } catch (e) {
      fail(e);
    }
  }
  async function logout() {
    try {
      await api("logout", "POST");
      accountRef.current = null;
      setUser(null);
      setResult(null);
      setQuery("");
      setLocation("");
      go("discover");
    } catch (e) {
      fail(e);
    }
  }
  async function assistant(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    setBusy(true);
    setAnswer("");
    try {
      const x = await api("workspace/assistant", "POST", { question: f.get("question"), consent: f.get("consent") === "on" });
      setAnswer(x.answer);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  const k = KINDS[kind];

  const discover = (
    <>
      <section className="nx-hero qx-hero">
        <div className="nx-container qx-hero__grid">
          <div className="qx-hero__copy">
            <p className="nx-eyebrow">Quarrix by Nexonic Technologies</p>
            <h1 className="nx-h1">Discover opportunities. <em>Build your future.</em></h1>
            <p className="nx-lead">Find remote jobs, registered businesses and public funding with clear source information, then keep everything in a private workspace that follows you between devices.</p>
            <ul className="qx-points">
              <li><Icon><path d="M20 6 9 17l-5-5" /></Icon>Every result links to its original source</li>
              <li><Icon><path d="M20 6 9 17l-5-5" /></Icon>No API keys or payment needed</li>
              <li><Icon><path d="M20 6 9 17l-5-5" /></Icon>Five free searches a day without an account</li>
            </ul>
          </div>
          <div className="qx-search nx-card" id="search" ref={searchRef}>
            <div className="qx-tabs" role="tablist" aria-label="What are you looking for?">
              {Object.entries(KINDS).map(([id, x]) => (
                <button key={id} type="button" role="tab" aria-selected={kind === id}
                  onClick={() => { setKind(id); setResult(null); history.replaceState(null, "", "#/" + x.route); }}>
                  {x.tab}
                </button>
              ))}
            </div>
            <p className="nx-eyebrow">{k.eyebrow}</p>
            <h2 className="qx-search__title">{k.heading}</h2>
            <form onSubmit={search} className="qx-form">
              <div className="nx-field">
                <label htmlFor="qx-q">Search keyword</label>
                <input id="qx-q" required maxLength={100} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={k.placeholder} />
              </div>
              {k.where && (
                <div className="nx-field">
                  <label htmlFor="qx-where">{k.where}</label>
                  <input id="qx-where" maxLength={100} value={location} onChange={(e) => setLocation(e.target.value)} placeholder={k.wherePlaceholder} />
                </div>
              )}
              {!user && <Turnstile key={searchCheck} sitekey={turnstileSiteKey} action="guest_search" />}
              <button className="nx-btn nx-btn--primary nx-btn--block" disabled={busy}>
                <span>{busy ? "Searching…" : "Search opportunities"}</span>
                {!busy && <Arrow />}
              </button>
            </form>
            <p className="qx-note">{k.coverage} Results are reported by the source and are not independently verified.</p>
            <p className="qx-note"><span className="nx-chip">{user ? "Free account · 50 searches a day" : "Guest · 5 searches and 10 results a day"}</span></p>
          </div>
        </div>
      </section>

      {result && (
        <section className="nx-section qx-results" id="qx-results">
          <div className="nx-container">
            <div className="qx-results__head">
              <div>
                <p className="nx-eyebrow">Results</p>
                <h2 className="nx-h2">{result.rows.length} {result.rows.length === 1 ? "match" : "matches"} for <em>“{query}”</em></h2>
              </div>
              <div className="qx-meta">
                <span className={"qx-status qx-status--" + result.status}>{STATUS[result.status] || result.status}</span>
                {result.checkedAt && <span>Checked {timeFormat.format(result.checkedAt)}</span>}
                {result.providers?.map((p) => <span key={p.name}>{p.name}: {STATUS[p.status] || p.status}</span>)}
                <span>{result.remaining} searches left today{!user && result.guestResultsLeft !== undefined ? ` · ${result.guestResultsLeft} free results left` : ""}</span>
              </div>
            </div>
            {!result.rows.length && (
              <div className="qx-empty nx-card">
                <h3 className="nx-h3">{["unavailable", "busy"].includes(result.status) ? "The source is busy right now" : "No matching listings"}</h3>
                <p>{["unavailable", "busy"].includes(result.status) ? "This search was not counted against your allowance. Please try again in a minute." : "Try fewer or broader words, check the spelling, or remove the region."}</p>
              </div>
            )}
            <div className="qx-list">
              {result.rows.map((r, i) => (
                <article className="nx-card qx-result" key={r.url + i}>
                  <div>
                    <p className="qx-result__src">{r.source}{r.date && <> · {niceDate(r.date)}</>}</p>
                    <h3 className="nx-h3">{r.title}</h3>
                    {r.subtitle && <p className="qx-result__sub">{r.subtitle}</p>}
                    {r.detail && <p className="qx-result__detail">{r.detail}</p>}
                  </div>
                  <div className="qx-actions">
                    <a className="nx-btn nx-btn--primary nx-btn--sm" href={r.url} target="_blank" rel="noopener noreferrer"><span>View source</span><External /></a>
                    <button className="nx-btn nx-btn--ghost nx-btn--sm" type="button" onClick={() => save(r)}><span>Save</span></button>
                  </div>
                </article>
              ))}
            </div>
            {!user && (
              <div className="qx-callout">
                <div>
                  <h3 className="nx-h3">Keep your discoveries in one place.</h3>
                  <p>A free account gives you 50 searches a day, private saved opportunities and encrypted CV storage.</p>
                </div>
                <a className="nx-btn nx-btn--light" href="#/create-account" onClick={(e) => { e.preventDefault(); go("create-account"); }}><span>Create free account</span><Arrow /></a>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="nx-section nx-section--soft">
        <div className="nx-container">
          <Head eyebrow="Three ways in" title={<>One search for <em>every next step.</em></>} />
          <div className="qx-ways">
            {Object.entries(KINDS).map(([id, x], i) => (
              <a key={id} className="nx-card qx-way" href={"#/" + x.route} onClick={(e) => { e.preventDefault(); go(x.route); }}>
                <span className="qx-way__n">0{i + 1} / {x.eyebrow}</span>
                <h3 className="nx-h3">{x.label}</h3>
                <p>{x.coverage}</p>
                <span className="qx-way__go">Start searching <Arrow /></span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="nx-section">
        <div className="nx-container">
          <Head eyebrow="Direct official portals" title={<>Explore more <em>opportunities.</em></>} lead="Open these official sites directly for regional jobs, education and tenders. They are directory links, not live results inside Quarrix." />
          <div className="qx-portals">
            {[
              ["Pakistan National Jobs Portal", "https://njp.gov.pk/jobs/", "Pakistan · Jobs"],
              ["HEC Scholarships", "https://www.hec.gov.pk/english/scholarshipsgrants/Pages/default.aspx", "Pakistan · Education"],
              ["Erasmus Mundus", "https://erasmus-plus.ec.europa.eu/opportunities/individuals/students/erasmus-mundus-joint-masters", "Europe · Scholarships"],
              ["Canada Job Bank", "https://www.jobbank.gc.ca/", "Canada · Jobs"],
              ["Find an apprenticeship", "https://www.gov.uk/apply-apprenticeship", "United Kingdom · Training"],
              ["EU Tenders Electronic Daily", "https://ted.europa.eu/", "Europe · Public tenders"],
            ].map(([name, url, category]) => (
              <a className="nx-card qx-portal" key={url} href={url} target="_blank" rel="noopener noreferrer">
                <small>{category}</small>
                <strong>{name}</strong>
                <External />
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="nx-section nx-section--soft">
        <div className="nx-container qx-benefits">
          {[
            ["Source transparency", "See where every result comes from and when it was last checked."],
            ["Private workspace", "Keep CVs, customer notes and applications together across devices, encrypted by the service."],
            ["Free first", "Core search and organisation need no API key, card or subscription."],
          ].map(([t, d], i) => (
            <div key={t}>
              <span className="qx-way__n">0{i + 1}</span>
              <h3 className="nx-h3">{t}</h3>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );

  const authPage = (
    <section className="nx-acct">
      <div className="nx-container qx-narrow">
        <div className="nx-card qx-auth">
          {emailFlow ? (
            <>
              <p className="nx-eyebrow">Your account</p>
              <h1 className="nx-h2">{emailFlow.kind === "verify" ? <>Confirm your <em>email.</em></> : <>Choose a new <em>password.</em></>}</h1>
              <form onSubmit={completeEmail} className="qx-form">
                {emailFlow.kind === "reset" && (
                  <div className="nx-field">
                    <label htmlFor="qx-newpass">New password</label>
                    <input id="qx-newpass" type="password" name="password" required minLength={12} maxLength={128} autoComplete="new-password" />
                    <small>At least 12 characters.</small>
                  </div>
                )}
                <button className="nx-btn nx-btn--primary nx-btn--block" disabled={busy}><span>{emailFlow.kind === "verify" ? "Verify email" : "Set new password"}</span></button>
              </form>
            </>
          ) : route === "forgot-password" ? (
            <>
              <p className="nx-eyebrow">Account recovery</p>
              <h1 className="nx-h2">Forgot your <em>password?</em></h1>
              <p>Enter your account email and we will send a link that works for 30 minutes. You can also ask for a new verification link.</p>
              <form onSubmit={recover} className="qx-form">
                <div className="nx-field">
                  <label htmlFor="qx-remail">Email</label>
                  <input id="qx-remail" type="email" name="email" required autoComplete="email" />
                </div>
                <div className="nx-field">
                  <label htmlFor="qx-rkind">I need to</label>
                  <select id="qx-rkind" name="kind">
                    <option value="reset">Reset my password</option>
                    <option value="verify">Get a new verification link</option>
                  </select>
                </div>
                <Turnstile key={recoveryCheck} sitekey={turnstileSiteKey} action="recovery" />
                <button className="nx-btn nx-btn--primary nx-btn--block" disabled={busy}><span>Send email</span></button>
              </form>
              <p className="qx-switch"><a href="#/sign-in" onClick={(e) => { e.preventDefault(); go("sign-in"); }}>Back to sign in</a></p>
            </>
          ) : (
            <>
              <p className="nx-eyebrow">Your Quarrix workspace</p>
              <h1 className="nx-h2">{route === "sign-in" ? <>Welcome <em>back.</em></> : <>Create a free <em>account.</em></>}</h1>
              <p>{route === "sign-in" ? "Sign in to open your saved opportunities, notes and documents." : "Fifty searches a day, saved opportunities and private CV storage. Free."}</p>
              <form onSubmit={auth} className="qx-form">
                <div className="nx-field">
                  <label htmlFor="qx-email">Email</label>
                  <input id="qx-email" name="email" type="email" autoComplete="email" required />
                </div>
                <div className="nx-field">
                  <label htmlFor="qx-pass">Password {route === "sign-in" && <a className="qx-forgot" href="#/forgot-password" onClick={(e) => { e.preventDefault(); go("forgot-password"); }}>Forgot password?</a>}</label>
                  <input id="qx-pass" name="password" type="password" minLength={route === "create-account" ? 12 : 1} maxLength={128} autoComplete={route === "create-account" ? "new-password" : "current-password"} required />
                  {route === "create-account" && <small>At least 12 characters.</small>}
                </div>
                {route === "create-account" && (
                  <>
                    {registrationMode === "invite" && (
                      <div className="nx-field">
                        <label htmlFor="qx-invite">Private invitation code</label>
                        <input id="qx-invite" name="invitationCode" type="password" autoComplete="off" required minLength={64} maxLength={64} />
                      </div>
                    )}
                    {registrationMode === "closed" && <p className="qx-alert">Public registration is not open yet.</p>}
                    <PrivacyNotice />
                    <label className="qx-check-row"><input name="privacyAccepted" type="checkbox" required /> I have read the Quarrix privacy notice.</label>
                    <label className="qx-check-row"><input name="newsletter" type="checkbox" /> Send me optional Quarrix news and updates.</label>
                  </>
                )}
                {(route === "sign-in" || registrationMode !== "closed") && (
                  <Turnstile key={`${route}:${authCheck}`} sitekey={turnstileSiteKey} action={route === "create-account" ? "signup" : "login"} />
                )}
                <button className="nx-btn nx-btn--primary nx-btn--block" disabled={busy || (route === "create-account" && registrationMode === "closed")}>
                  <span>{route === "sign-in" ? "Sign in" : "Create free account"}</span>
                </button>
              </form>
              <p className="qx-switch">
                {route === "sign-in" ? "New to Quarrix? " : "Already registered? "}
                <a href={route === "sign-in" ? "#/create-account" : "#/sign-in"} onClick={(e) => { e.preventDefault(); go(route === "sign-in" ? "create-account" : "sign-in"); }}>
                  {route === "sign-in" ? "Create an account" : "Sign in"}
                </a>
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );

  const workspacePage = user && (
    <>
      <section className="nx-acct qx-ws-head">
        <div className="nx-container">
          <p className="nx-eyebrow">Private workspace</p>
          <h1 className="nx-h1">Your opportunities, <em>organised.</em></h1>
          <p className="nx-lead">Signed in as {user.email}</p>
          <div className="qx-stats">
            <div><b>{workspace.records.length}</b><span>records</span></div>
            <div><b>{workspace.documents.length}</b><span>documents</span></div>
            <div><b>{Math.round(workspace.documents.reduce((n, d) => n + Number(d.bytes), 0) / 1000)} KB</b><span>stored of 10 MB</span></div>
          </div>
        </div>
      </section>
      <section className="nx-section nx-section--soft qx-ws">
        <div className="nx-container qx-ws__grid">
          <div className="nx-card">
            <h2 className="nx-h3">{entry.id ? "Edit record" : "Add a record"}</h2>
            <form onSubmit={record} className="qx-form">
              <div className="nx-field">
                <label htmlFor="qx-rk">Category</label>
                <select id="qx-rk" value={entry.kind} onChange={(e) => setEntry({ ...entry, kind: e.target.value })}>
                  {["business", "profile", "opportunity", "application", "customer", "resume"].map((x) => <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>)}
                </select>
              </div>
              <div className="nx-field"><label htmlFor="qx-rt">Title</label><input id="qx-rt" required maxLength={160} value={entry.title} onChange={(e) => setEntry({ ...entry, title: e.target.value })} /></div>
              <div className="nx-field"><label htmlFor="qx-rn">Notes</label><textarea id="qx-rn" rows={4} maxLength={8000} value={entry.notes} onChange={(e) => setEntry({ ...entry, notes: e.target.value })} /></div>
              <div className="nx-field"><label htmlFor="qx-ru">Website <em>(optional)</em></label><input id="qx-ru" type="url" value={entry.url} onChange={(e) => setEntry({ ...entry, url: e.target.value })} /></div>
              <div className="nx-field"><label htmlFor="qx-rs">Status</label><input id="qx-rs" maxLength={60} value={entry.status} onChange={(e) => setEntry({ ...entry, status: e.target.value })} /></div>
              <div className="qx-actions">
                <button className="nx-btn nx-btn--primary nx-btn--sm"><span>Save record</span></button>
                {entry.id && <button type="button" className="nx-btn nx-btn--ghost nx-btn--sm" onClick={() => setEntry(initial)}><span>Cancel</span></button>}
              </div>
            </form>
          </div>
          <div className="nx-card qx-ws__wide">
            <h2 className="nx-h3">My records</h2>
            {!workspace.records.length && <p className="qx-muted">No saved records yet. Save a search result or add one here.</p>}
            {workspace.records.map((r) => (
              <article className="qx-row" key={r.id}>
                <div>
                  <p className="qx-result__src">{r.kind}{r.status && " · " + r.status}{r.updated && " · " + dateFormat.format(r.updated)}</p>
                  <h3 className="nx-h3">{r.title}</h3>
                  {r.notes && <p className="qx-result__detail">{r.notes}</p>}
                  {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer">Open source ↗</a>}
                </div>
                <div className="qx-actions">
                  <button type="button" className="nx-btn nx-btn--ghost nx-btn--sm" onClick={() => { setEntry(r); window.scrollTo({ top: 0, behavior: "smooth" }); }}><span>Edit</span></button>
                  <button type="button" className="nx-btn nx-btn--ghost nx-btn--sm" onClick={() => remove("records", r.id)}><span>Remove</span></button>
                </div>
              </article>
            ))}
          </div>
          <div className="nx-card">
            <h2 className="nx-h3">CVs and documents</h2>
            <p className="qx-muted">Encrypted PDF storage · 2 MB each · 10 MB per account.</p>
            <div className="nx-field"><label htmlFor="qx-up">Upload a PDF</label><input id="qx-up" type="file" accept="application/pdf,.pdf" onChange={upload} disabled={busy} /></div>
            {workspace.documents.map((d) => (
              <div className="qx-row" key={d.id}>
                <a href={"/api/workspace/documents/" + d.id}>{d.name}</a>
                <button type="button" className="nx-btn nx-btn--ghost nx-btn--sm" onClick={() => remove("documents", d.id)}><span>Remove</span></button>
              </div>
            ))}
          </div>
          <div className="nx-card">
            <h2 className="nx-h3">Recent searches</h2>
            <p className="qx-muted">Your last 50 searches from the past 30 days. Private unless you allow support access.</p>
            {!historyRows.length && <p className="qx-muted">No searches yet.</p>}
            {historyRows.map((h, i) => (
              <div className="qx-row" key={i}>
                <div>
                  <p className="qx-result__src">{h.kind === "business" ? "customers" : h.kind}{h.created && " · " + timeFormat.format(h.created)}</p>
                  <strong>{h.query}</strong>
                  <p className="qx-result__detail">{[h.location, STATUS[h.status] || h.status, h.count + " results"].filter(Boolean).join(" · ")}</p>
                </div>
              </div>
            ))}
            {!!historyRows.length && (
              <button type="button" className="nx-btn nx-btn--ghost nx-btn--sm" onClick={async () => {
                if (!confirm("Clear search history?")) return;
                try { await api("workspace/history", "DELETE"); setHistoryRows([]); } catch (e) { fail(e); }
              }}><span>Clear history</span></button>
            )}
          </div>
          <div className="nx-card">
            <h2 className="nx-h3">Preferences</h2>
            <label className="qx-check-row">
              <input type="checkbox" checked={subscribed} onChange={async (e) => {
                try { setSubscribed((await api("workspace/newsletter", "PUT", { subscribed: e.target.checked })).subscribed); } catch (e) { fail(e); }
              }} /> Receive optional news and updates
            </label>
            <h3 className="qx-sub">Support access</h3>
            <p className="qx-muted">Only turn this on when you ask for help. The portal owner can then view your records, recent searches and CVs for one hour. Access is logged and you can revoke it at any time.</p>
            <button type="button" className="nx-btn nx-btn--ghost nx-btn--sm" onClick={async () => {
              try {
                const share = !(support > Date.now());
                if (share && !confirm("Allow the portal owner to view your private records, search history and documents for one hour?")) return;
                setSupport((await api("workspace/support", "PUT", { share })).expires);
              } catch (e) { fail(e); }
            }}><span>{support > Date.now() ? "Revoke support access" : "Allow temporary support access"}</span></button>
            <h3 className="qx-sub">Your data</h3>
            <button type="button" className="nx-btn nx-btn--ghost nx-btn--sm" onClick={() => {
              const blob = new Blob([JSON.stringify(workspace, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob), a = document.createElement("a");
              a.href = url; a.download = "quarrix-workspace.json"; a.click(); URL.revokeObjectURL(url);
            }}><span>Export workspace records</span></button>
            <form className="qx-form qx-danger" onSubmit={async (e) => {
              e.preventDefault();
              if (!confirm("Permanently delete this account and its records? This cannot be undone.")) return;
              try {
                await api("workspace/delete-account", "POST", { password: new FormData(e.target).get("password") });
                setUser(null);
                go("discover");
                say("Your account and its records were deleted.", "success");
              } catch (e) { fail(e); }
            }}>
              <div className="nx-field"><label htmlFor="qx-del">Delete account: confirm password</label><input id="qx-del" type="password" name="password" required autoComplete="current-password" /></div>
              <button className="nx-btn nx-btn--danger nx-btn--sm"><span>Delete my account</span></button>
            </form>
          </div>
          {assistantAvailable && (
            <div className="nx-card">
              <h2 className="nx-h3">Career & business assistant</h2>
              <p className="qx-muted">Optional free guidance. Never include private or identifying information.</p>
              <form onSubmit={assistant} className="qx-form">
                <div className="nx-field"><label htmlFor="qx-ask">Your question</label><textarea id="qx-ask" name="question" required maxLength={1500} /></div>
                <label className="qx-check-row"><input type="checkbox" name="consent" required /> Send this question to OpenRouter for processing.</label>
                <button className="nx-btn nx-btn--primary nx-btn--sm" disabled={busy}><span>Ask assistant</span></button>
              </form>
              {answer && <p className="qx-answer">{answer}</p>}
            </div>
          )}
        </div>
      </section>
    </>
  );

  const desktopPage = (
    <section className="nx-acct">
      <div className="nx-container qx-narrow qx-prose">
        <p className="nx-eyebrow">Quarrix desktop</p>
        <h1 className="nx-h1">The full toolkit, <em>on your computer.</em></h1>
        <p className="nx-lead">The free desktop app keeps a local, private database and adds lead discovery, outreach, CRM and career tools that are not in the web portal yet.</p>
        <p><a className="nx-btn nx-btn--primary" href="https://github.com/nexonic-technologies/quarrix/releases/latest" target="_blank" rel="noopener noreferrer"><span>Download for Windows, macOS or Linux</span><External /></a></p>
        <div className="qx-alert">
          <strong>Before you install:</strong> the current builds are not code-signed yet. Windows SmartScreen or macOS Gatekeeper will warn that the publisher is unknown. Download only from the official GitHub release above and compare the published SHA-256 checksums.
        </div>
      </div>
    </section>
  );

  const privacyPage = (
    <section className="nx-acct">
      <div className="nx-container qx-narrow qx-prose">
        <p className="nx-eyebrow">Quarrix privacy notice · 23 November 2026</p>
        <h1 className="nx-h1">Your data, <em>plainly.</em></h1>
        <PrivacyText />
        <p>See also the <a href={SITE + "/privacy-policy/"}>Nexonic Technologies privacy policy</a>.</p>
      </div>
    </section>
  );

  const notFoundPage = (
    <section className="nx-acct">
      <div className="nx-container qx-narrow qx-prose">
        <p className="nx-eyebrow">Error 404</p>
        <h1 className="nx-h1">This page could not be <em>found.</em></h1>
        <p className="nx-lead">The address may be mistyped, or the page has moved.</p>
        <p><a className="nx-btn nx-btn--primary" href="/"><span>Go to Quarrix</span><Arrow /></a></p>
      </div>
    </section>
  );

  let view;
  if (notFound) view = notFoundPage;
  else if (maintenance)
    view = (
      <section className="nx-acct">
        <div className="nx-container qx-narrow qx-prose">
          <p className="nx-eyebrow">Quarrix · maintenance</p>
          <h1 className="nx-h1">Work in <em>progress.</em></h1>
          <p className="nx-lead">We are upgrading the portal. Your saved workspace is safe. Please check back shortly.</p>
          <p><button className="nx-btn nx-btn--primary" onClick={() => window.location.reload()}><span>Check again</span></button></p>
        </div>
      </section>
    );
  else if (["sign-in", "create-account", "forgot-password"].includes(route)) view = authPage;
  else if (route === "workspace") view = workspacePage || <section className="nx-acct"><div className="nx-container"><p>Loading…</p></div></section>;
  else if (route === "desktop") view = desktopPage;
  else if (route === "privacy") view = privacyPage;
  else view = discover;

  return (
    <>
      <a className="qx-skip" href="#main">Skip to content</a>
      <Header user={user} route={route} go={go} />
      <ProductBar route={notFound ? "" : route} go={go} user={user} onSignOut={logout} />
      <main id="main" className="nx-main">
        {notice && (
          <div className={"qx-notice qx-notice--" + notice.tone} role={notice.tone === "error" ? "alert" : "status"}>
            <span>{notice.text}</span>
            <button type="button" aria-label="Dismiss message" onClick={() => say("")}>×</button>
          </div>
        )}
        {view}
      </main>
      <Footer privacy={(e) => { e.preventDefault(); go("privacy"); }} />
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
