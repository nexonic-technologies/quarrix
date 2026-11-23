import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/fraunces/wght-italic.css";
import "./styles.css";
const initial = { kind: "business", title: "", notes: "", url: "", status: "" };
async function api(path, method = "GET", body) {
  const response = await fetch("/api/" + path, {
    method,
    headers: method === "GET" ? {} : { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
  });
  const data = await response.json();
  if (!response.ok) {
    const e = Error(data.error || "Request failed");
    e.data = data;
    throw e;
  }
  return data;
}
function App() {
  const accountRef = useRef(null);
  const [emailFlow, setEmailFlow] = useState(() => {
      const match = window.location.hash.match(
        /^#(verify|reset)=([a-f0-9]{64})$/,
      );
      return match ? { kind: match[1], token: match[2] } : null;
    }),
    [user, setUser] = useState(null),
    [assistantAvailable, setAssistantAvailable] = useState(false),
    [maintenance, setMaintenance] = useState(false),
    [page, setPage] = useState("discover"),
    [kind, setKind] = useState("jobs"),
    [query, setQuery] = useState(""),
    [location, setLocation] = useState(""),
    [result, setResult] = useState(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [mode, setMode] = useState("login"),
    [workspace, setWorkspace] = useState({ records: [], documents: [] }),
    [entry, setEntry] = useState(initial),
    [subscribed, setSubscribed] = useState(false),
    [answer, setAnswer] = useState(""),
    [support, setSupport] = useState(0),
    [historyRows, setHistoryRows] = useState([]);
  const fail = (e) => {
    setNotice(e.message);
    if (e.data?.registrationRequired) {
      setMode("register");
      setPage("account");
    }
    if (e.data?.maintenance) setMaintenance(true);
  };
  useEffect(() => {
    if (emailFlow) {
      setPage("account");
      history.replaceState(null, "", window.location.pathname);
    }
    api("session")
      .then((x) => {
        setUser(x.user);
        setAssistantAvailable(x.assistantAvailable);
        setMaintenance(x.maintenance || false);
      })
      .catch(fail);
  }, []);
  async function refresh() {
    if (!user) return;
    const id = user.id;
    try {
      const [w, n, s, h] = await Promise.all([
        api("workspace"),
        api("workspace/newsletter"),
        api("workspace/support"),
        api("workspace/history"),
      ]);
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
  function go(p) {
    setNotice("");
    if (p === "workspace" && !user) {
      setMode("register");
      setPage("account");
      return;
    }
    setPage(p);
  }
  async function search(e) {
    e.preventDefault();
    setBusy(true);
    setNotice("");
    setResult(null);
    try {
      setResult(await api("discover", "POST", { kind, q: query, location }));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function auth(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    setBusy(true);
    setNotice("");
    try {
      const x = await api(mode, "POST", {
        email: f.get("email"),
        password: f.get("password"),
        newsletter: f.get("newsletter") === "on",
      });
      if (x.verificationRequired) {
        setNotice(x.message);
        setMode("login");
        return;
      }
      setUser(x.user);
      setPage("workspace");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function save(r) {
    if (!user) {
      setMode("register");
      setPage("account");
      return;
    }
    try {
      await api("workspace/records", "POST", {
        kind: "opportunity",
        title: r.title,
        notes: `${r.source} · ${r.subtitle}`,
        url: r.url,
        status: "Saved",
      });
      setNotice("Saved to your workspace.");
      refresh();
    } catch (e) {
      fail(e);
    }
  }
  async function record(e) {
    e.preventDefault();
    try {
      await api(
        "workspace/records" + (entry.id ? "/" + entry.id : ""),
        entry.id ? "PUT" : "POST",
        entry,
      );
      setEntry(initial);
      refresh();
      setNotice("Workspace updated.");
    } catch (e) {
      fail(e);
    }
  }
  async function upload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) {
      setNotice("PDF must be under 2 MB.");
      return;
    }
    setBusy(true);
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await api("workspace/documents", "POST", {
        name: file.name,
        content: data,
      });
      refresh();
      setNotice("Document uploaded privately.");
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
      setPage("discover");
      setNotice("");
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
      const x = await api("workspace/assistant", "POST", {
        question: f.get("question"),
        consent: f.get("consent") === "on",
      });
      setAnswer(x.answer);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header>
        <a className="brand" href="https://nexonictechnologies.com">
          <span className="mark">N</span>
          <span>
            <b>nexonic</b>
            <small>TECHNOLOGIES</small>
          </span>
        </a>
        <nav aria-label="Main">
          <button
            className={page === "discover" ? "active" : ""}
            onClick={() => go("discover")}
          >
            Discover
          </button>
          <button
            className={page === "workspace" ? "active" : ""}
            onClick={() => go("workspace")}
          >
            Workspace
          </button>
          <a href="https://github.com/nexonic-technologies/quarrix/releases/latest">
            Download desktop ↗
          </a>
        </nav>
        <div>
          {user ? (
            <button onClick={logout}>Sign out</button>
          ) : (
            <button
              className="primary"
              onClick={() => {
                setMode("login");
                go("account");
              }}
            >
              Sign in
            </button>
          )}
        </div>
      </header>
      {maintenance ? (
        <main className="maintenance">
          <p className="eyebrow">QUARRIX · MAINTENANCE</p>
          <h1>
            Work in <em>progress.</em>
          </h1>
          <p>
            We're upgrading the portal. Your saved workspace remains safe.
            Please check back shortly.
          </p>
          <button className="primary" onClick={() => window.location.reload()}>
            Check again
          </button>
        </main>
      ) : (
        <main>
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                ×
              </button>
            </div>
          )}
          {page === "discover" && (
            <>
              <section className="hero">
                <p className="eyebrow">NEXONIC TECHNOLOGIES / QUARRIX</p>
                <h1>
                  Discover opportunities.
                  <br />
                  <em>Build your future.</em>
                </h1>
                <p className="intro">
                  Find real business opportunities, remote vacancies and public
                  funding — with clear source information and a workspace that
                  travels with you.
                </p>
                <div className="choices">
                  <button
                    className={kind === "jobs" ? "selected" : ""}
                    onClick={() => {
                      setKind("jobs");
                      setResult(null);
                    }}
                  >
                    <span>01 / CAREER</span>
                    <strong>Find a job</strong>
                    <small>Remote roles and career opportunities →</small>
                  </button>
                  <button
                    className={kind === "business" ? "selected" : ""}
                    onClick={() => {
                      setKind("business");
                      setResult(null);
                    }}
                  >
                    <span>02 / BUSINESS</span>
                    <strong>Find customers</strong>
                    <small>Public company registry discovery →</small>
                  </button>
                  <button
                    className={kind === "grants" ? "selected" : ""}
                    onClick={() => {
                      setKind("grants");
                      setResult(null);
                    }}
                  >
                    <span>03 / FUNDING</span>
                    <strong>Find grants</strong>
                    <small>Official funding opportunities →</small>
                  </button>
                </div>
              </section>
              <section className="panel search">
                <div className="section-head">
                  <div>
                    <p className="eyebrow">LIVE DISCOVERY</p>
                    <h2>
                      {kind === "jobs"
                        ? "Find jobs"
                        : kind === "business"
                          ? "Find registered businesses"
                          : "Find US public grants"}
                    </h2>
                  </div>
                  <span className="badge">
                    {user ? "Free account" : "10 free results / day"}
                  </span>
                </div>
                <form onSubmit={search} className="search-form">
                  <label>
                    Search keyword
                    <input
                      required
                      maxLength={100}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={
                        kind === "jobs"
                          ? "Software engineer"
                          : kind === "business"
                            ? "Company name"
                            : "Education"
                      }
                    />
                  </label>
                  {kind !== "grants" && (
                    <label>
                      {kind === "business"
                        ? "City in France"
                        : "Region (optional)"}
                      <input
                        maxLength={100}
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder={
                          kind === "business" ? "Paris" : "Worldwide"
                        }
                      />
                    </label>
                  )}
                  <button className="primary" disabled={busy}>
                    {busy ? "Searching…" : "Search opportunities →"}
                  </button>
                </form>
                <p className="muted">
                  {kind === "business"
                    ? "Coverage: French public business registry. More regions will be added as permitted."
                    : kind === "jobs"
                      ? "Coverage: Jobicy remote jobs and Arbeitnow European vacancies. Check the source for eligibility and location."
                      : "Coverage: posted Grants.gov opportunities. Check official eligibility and deadlines."}{" "}
                  Results are source-reported, not independently verified.
                </p>
                {result && (
                  <>
                    {result.providers && (
                      <p className="muted">
                        {result.providers
                          .map((p) => `${p.name}: ${p.status}`)
                          .join(" · ")}
                      </p>
                    )}
                    <div className="section-head">
                      <p>
                        {result.rows.length} results · {result.status}{" "}
                        {result.checkedAt
                          ? " · " + new Date(result.checkedAt).toLocaleString()
                          : ""}
                      </p>
                      <span className="badge">
                        {result.remaining} searches left today
                        {!user &&
                          result.guestResultsLeft !== undefined &&
                          ` · ${result.guestResultsLeft} free results left`}
                      </span>
                    </div>
                    {!result.rows.length && (
                      <p>
                        {result.status === "unavailable" ||
                        result.status === "busy"
                          ? "Source busy or unavailable. Please try later."
                          : "No matching listings in this source."}
                      </p>
                    )}
                    {result.rows.map((r, i) => (
                      <article className="result" key={r.url + i}>
                        <div>
                          <span className="eyebrow">{r.source}</span>
                          <h3>{r.title}</h3>
                          <p>
                            {r.subtitle} {r.detail}
                          </p>
                          {r.date && <small>{r.date}</small>}
                        </div>
                        <div className="actions">
                          <a
                            className="button"
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View source ↗
                          </a>
                          <button onClick={() => save(r)}>Save</button>
                        </div>
                      </article>
                    ))}
                    {!user && (
                      <div className="callout">
                        <strong>Keep your discoveries in one place.</strong>
                        <p>
                          Create a free account for more results, private saved
                          opportunities and CV uploads.
                        </p>
                        <button
                          className="primary"
                          onClick={() => {
                            setMode("register");
                            go("account");
                          }}
                        >
                          Create free account
                        </button>
                      </div>
                    )}
                  </>
                )}
              </section>
              <section className="panel directories">
                <p className="eyebrow">DIRECT OFFICIAL PORTALS</p>
                <h2>Explore more opportunities</h2>
                <p className="muted">
                  Open these official sites directly for regional jobs,
                  education and tenders. These are directory links, not live
                  aggregated search results.
                </p>
                <div className="directory-grid">
                  {[
                    [
                      "Pakistan National Jobs Portal",
                      "https://njp.gov.pk/jobs/",
                      "Pakistan · Jobs",
                    ],
                    [
                      "HEC Scholarships",
                      "https://www.hec.gov.pk/english/scholarshipsgrants/Pages/default.aspx",
                      "Pakistan · Education",
                    ],
                    [
                      "Erasmus Mundus",
                      "https://erasmus-plus.ec.europa.eu/opportunities/individuals/students/erasmus-mundus-joint-masters",
                      "Europe · Scholarships",
                    ],
                    [
                      "Canada Job Bank",
                      "https://www.jobbank.gc.ca/",
                      "Canada · Jobs",
                    ],
                    [
                      "Find an apprenticeship",
                      "https://www.gov.uk/apply-apprenticeship",
                      "United Kingdom · Training",
                    ],
                    [
                      "EU Tenders Electronic Daily",
                      "https://ted.europa.eu/",
                      "Europe · Public tenders",
                    ],
                  ].map(([name, url, category]) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <small>{category}</small>
                      <strong>{name} ↗</strong>
                    </a>
                  ))}
                </div>
              </section>
              <section className="benefits">
                <div>
                  <b>01</b>
                  <h3>Source transparency</h3>
                  <p>See where results come from and when they were checked.</p>
                </div>
                <div>
                  <b>02</b>
                  <h3>Private workspace</h3>
                  <p>
                    Keep resumes, customer notes and applications together
                    across devices.
                  </p>
                </div>
                <div>
                  <b>03</b>
                  <h3>Free first</h3>
                  <p>No API key needed for core searches and organization.</p>
                </div>
              </section>
            </>
          )}
          {page === "account" && (
            <section className="panel account">
              <p className="eyebrow">YOUR WORKSPACE</p>
              <h1>{mode === "login" ? "Welcome back." : "Get started."}</h1>
              <p>
                {mode === "register"
                  ? "A free account unlocks private documents and more searches."
                  : "Sign in to sync your workspace."}
              </p>
              {emailFlow ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await api("email-complete", "POST", {
                        ...emailFlow,
                        password: new FormData(e.target).get("password"),
                      });
                      setEmailFlow(null);
                      setNotice("Email confirmed. You can now sign in.");
                    } catch (e) {
                      fail(e);
                    }
                  }}
                >
                  {emailFlow.kind === "reset" && (
                    <label>
                      New password
                      <input
                        type="password"
                        name="password"
                        required
                        minLength={12}
                        maxLength={128}
                      />
                    </label>
                  )}
                  <button className="primary">
                    {emailFlow.kind === "verify"
                      ? "Verify email"
                      : "Set new password"}
                  </button>
                </form>
              ) : (
                <>
                  <form onSubmit={auth}>
                    <label>
                      Email
                      <input
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                      />
                    </label>
                    <label>
                      Password
                      <input
                        name="password"
                        type="password"
                        minLength={mode === "register" ? 12 : 1}
                        maxLength={128}
                        autoComplete={
                          mode === "register"
                            ? "new-password"
                            : "current-password"
                        }
                        required
                      />
                    </label>
                    {mode === "register" && (
                      <>
                        <p className="muted">
                          Use at least 12 characters. Your workspace is private;
                          the portal owner can see account and usage metadata.
                        </p>
                        <label className="check">
                          <input name="newsletter" type="checkbox" /> Send me
                          optional Quarrix news and updates
                        </label>
                      </>
                    )}
                    <button className="primary" disabled={busy}>
                      {mode === "login" ? "Sign in" : "Create free account"}
                    </button>
                  </form>
                  <button
                    className="link"
                    onClick={() =>
                      setMode(mode === "login" ? "register" : "login")
                    }
                  >
                    {mode === "login"
                      ? "New here? Create account"
                      : "Already registered? Sign in"}
                  </button>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        const f = new FormData(e.target),
                          r = await api("email-request", "POST", {
                            email: f.get("email"),
                            kind: f.get("kind"),
                          });
                        setNotice(r.message);
                      } catch (e) {
                        fail(e);
                      }
                    }}
                  >
                    <label>
                      Account recovery email
                      <input type="email" name="email" required />
                    </label>
                    <label>
                      Request
                      <select name="kind">
                        <option value="reset">Reset password</option>
                        <option value="verify">Resend verification</option>
                      </select>
                    </label>
                    <button>Send recovery email</button>
                  </form>
                </>
              )}
            </section>
          )}
          {page === "workspace" && user && (
            <>
              <section className="workspace-head">
                <p className="eyebrow">PRIVATE WORKSPACE</p>
                <h1>
                  Your opportunities, <em>organized.</em>
                </h1>
                <p>{user.email}</p>
              </section>
              <div className="stats">
                <div>
                  <b>{workspace.records.length}</b> records
                </div>
                <div>
                  <b>{workspace.documents.length}</b> documents
                </div>
                <div>
                  <b>
                    {Math.round(
                      workspace.documents.reduce(
                        (n, d) => n + Number(d.bytes),
                        0,
                      ) / 1000,
                    )}{" "}
                    KB
                  </b>{" "}
                  stored
                </div>
              </div>
              <div className="workspace-grid">
                <section className="panel">
                  <h2>{entry.id ? "Edit record" : "Add a record"}</h2>
                  <form onSubmit={record}>
                    <label>
                      Category
                      <select
                        value={entry.kind}
                        onChange={(e) =>
                          setEntry({ ...entry, kind: e.target.value })
                        }
                      >
                        {[
                          "business",
                          "profile",
                          "opportunity",
                          "application",
                          "customer",
                          "resume",
                        ].map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Title
                      <input
                        required
                        value={entry.title}
                        onChange={(e) =>
                          setEntry({ ...entry, title: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Notes
                      <textarea
                        rows={4}
                        value={entry.notes}
                        onChange={(e) =>
                          setEntry({ ...entry, notes: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Website (optional)
                      <input
                        type="url"
                        value={entry.url}
                        onChange={(e) =>
                          setEntry({ ...entry, url: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Status
                      <input
                        value={entry.status}
                        onChange={(e) =>
                          setEntry({ ...entry, status: e.target.value })
                        }
                      />
                    </label>
                    <button className="primary">Save record</button>
                  </form>
                </section>
                <section className="panel">
                  <h2>My records</h2>
                  {!workspace.records.length && (
                    <p className="muted">No saved records yet.</p>
                  )}
                  {workspace.records.map((r) => (
                    <article className="result" key={r.id}>
                      <div>
                        <span className="eyebrow">
                          {r.kind} · {r.status}
                        </span>
                        <h3>{r.title}</h3>
                        <p>{r.notes}</p>
                        {r.url && (
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open source ↗
                          </a>
                        )}
                      </div>
                      <div className="actions">
                        <button onClick={() => setEntry(r)}>Edit</button>
                        <button onClick={() => remove("records", r.id)}>
                          Remove
                        </button>
                      </div>
                    </article>
                  ))}
                </section>
                <section className="panel">
                  <h2>CVs and documents</h2>
                  <p>Encrypted PDF storage · 2 MB each · 10 MB per account.</p>
                  <label>
                    Upload PDF
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={upload}
                      disabled={busy}
                    />
                  </label>
                  {workspace.documents.map((d) => (
                    <article className="result" key={d.id}>
                      <a href={"/api/workspace/documents/" + d.id}>{d.name}</a>
                      <button onClick={() => remove("documents", d.id)}>
                        Remove
                      </button>
                    </article>
                  ))}
                </section>
                <section className="panel">
                  <h2>Recent searches</h2>
                  <p className="muted">
                    Last 50 searches, up to 30 days. Private unless you allow
                    support access.
                  </p>
                  {historyRows.map((h, i) => (
                    <article className="result" key={i}>
                      <div>
                        <span className="eyebrow">{h.kind}</span>
                        <h3>{h.query}</h3>
                        <p>
                          {h.location} · {h.status} · {h.count} results
                        </p>
                      </div>
                    </article>
                  ))}
                  <button
                    onClick={async () => {
                      if (!confirm("Clear search history?")) return;
                      try {
                        await api("workspace/history", "DELETE");
                        setHistoryRows([]);
                      } catch (e) {
                        fail(e);
                      }
                    }}
                  >
                    Clear history
                  </button>
                </section>
                <section className="panel">
                  <h2>Preferences</h2>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={subscribed}
                      onChange={async (e) => {
                        try {
                          setSubscribed(
                            (
                              await api("workspace/newsletter", "PUT", {
                                subscribed: e.target.checked,
                              })
                            ).subscribed,
                          );
                        } catch (e) {
                          fail(e);
                        }
                      }}
                    />{" "}
                    Receive optional news and updates
                  </label>
                  <p className="muted">
                    You can unsubscribe any time. Account email is used to sign
                    in.
                  </p>
                  <h3>Support access</h3>
                  <p>
                    Only enable this when requesting help. The portal owner can
                    view your records, recent searches and download CVs for one
                    hour. Access is logged and you can revoke it at any time.
                  </p>
                  <button
                    onClick={async () => {
                      try {
                        const share = !(support > Date.now());
                        if (
                          share &&
                          !confirm(
                            "Allow the portal owner to view your private records, search history and documents for one hour?",
                          )
                        )
                          return;
                        setSupport(
                          (await api("workspace/support", "PUT", { share }))
                            .expires,
                        );
                      } catch (e) {
                        fail(e);
                      }
                    }}
                  >
                    {support > Date.now()
                      ? "Revoke support access"
                      : "Allow temporary support access"}
                  </button>
                  <button
                    onClick={() => {
                      const blob = new Blob(
                        [JSON.stringify(workspace, null, 2)],
                        { type: "application/json" },
                      );
                      const url = URL.createObjectURL(blob),
                        a = document.createElement("a");
                      a.href = url;
                      a.download = "quarrix-workspace.json";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Export workspace records
                  </button>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (
                        !confirm(
                          "Permanently delete this account and its records?",
                        )
                      )
                        return;
                      try {
                        await api("workspace/delete-account", "POST", {
                          password: new FormData(e.target).get("password"),
                        });
                        setUser(null);
                        setPage("discover");
                      } catch (e) {
                        fail(e);
                      }
                    }}
                  >
                    <label>
                      Delete account: confirm password
                      <input
                        type="password"
                        name="password"
                        required
                        autoComplete="current-password"
                      />
                    </label>
                    <button>Delete my account</button>
                  </form>
                </section>
                {assistantAvailable && (
                  <section className="panel">
                    <h2>Career & business assistant</h2>
                    <p>
                      Optional free guidance. Never include private or
                      identifying information.
                    </p>
                    <form onSubmit={assistant}>
                      <label>
                        Your question
                        <textarea name="question" required maxLength={1500} />
                      </label>
                      <label className="check">
                        <input type="checkbox" name="consent" required /> Send
                        this question to OpenRouter for processing.
                      </label>
                      <button className="primary" disabled={busy}>
                        Ask assistant
                      </button>
                    </form>
                    {answer && <p className="answer">{answer}</p>}
                  </section>
                )}
              </div>
            </>
          )}
        </main>
      )}
      <footer>
        <span>© 2026 Nexonic Technologies · Quarrix Web</span>
        <a href="https://nexonictechnologies.com/privacy-policy/">
          Privacy & contact
        </a>
        <a href="https://nexonictechnologies.com">Nexonic Technologies ↗</a>
      </footer>
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
