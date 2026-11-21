# Final audit, v0.25.0

## v0.25.0 (hardening milestone)

Fixed (each with a test in test/v025.test.ts or test/int/v025.int.ts):
- **Critical: column-name injection and signal reassignment.** `signals:update` built SQL from the caller's keys; a crafted key could rewrite `lead_id` (move a signal to another client's lead). Now only `seen`/`dismissed` (0/1) at both the IPC check and the database function.
- **Critical: lead transfer between clients.** `leads:update` accepted any lead column, including `client`, `search_id` and `source`. New runtime allowlist (src/main/validate.ts) for every mutating channel: types, lengths, email format, status values, record existence. Protected fields are refused with a clear message.
- Sent messages can no longer be edited; message edits are limited to subject, body and send time. Tasks cannot link a deal to a different lead. `messages:cancel` now has the workspace guard. `leads:add` refuses workspace/source fields and needs a name.
- **Franchise dedupe:** a shared central phone or domain no longer merges branches; another city, another street address or more than 300 m apart means another place (safety.differentPlace), in imports and the duplicate review.
- **Career signals:** followed-employer postings are recognised by the employer's ID prefix (they were never classified before); CV matching is whole-word ("Java" no longer matches "JavaScript"; generic role words like "developer" no longer count); the unread badge counts each posting once and skips dismissed ones.
- **Workday:** busy answers (429/5xx/timeouts) retried with backoff, HTML answers explained, pages already read are kept, `total` respected. **Overpass:** a second, slower round on the two main servers for busy answers; HTML answers treated as busy.
- **Job search Stop** now cancels the requests still in flight (AbortSignal through AsyncLocalStorage into every fetch); the Google Jobs hidden window still ends at its own timeout.
- **AI failover:** timeouts, connection resets and empty answers also move to the next model/key.
- **Dependencies:** uuid forced to 11.1.1 (exceljs advisory GHSA-w5hq-g745-h8pq); `npm audit --omit=dev` reports 0. Remaining: 2 moderate advisories in build-time tooling only (minimatch inside electron-builder), no non-breaking fix; not shipped in the app.
- **Release checks:** CPU type of every shipped build is verified (macOS arm64/x86_64 with lipo, Windows AMD64/ARM64 from the PE header), the Linux AppImage gets its own installed-app smoke run, and the macOS Intel build is run under Rosetta when the runner has it.

Still blocked (no credentials or infrastructure were provided; nothing was invented or scraped): Hunter, ZeroBounce, Google and Microsoft OAuth, SendGrid, HubSpot, Google Sheets, Notion and inbox placement need the owner's accounts (docs/CREDENTIALS.md); hosted collaboration needs a sync service; partner-only job boards need partner access; signing needs an Apple Developer ID certificate with notarization account (CSC_LINK, CSC_KEY_PASSWORD, APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID) and a Windows code-signing certificate (WIN_CSC_LINK, WIN_CSC_KEY_PASSWORD) in the repository secrets. Windows ARM64 is verified by CPU type only (no ARM64 runner).

# Earlier: v0.24.0

## v0.24.0 (owner feedback)

- **Job signals (career workspace):** a profile search built from the CV (first target role, else title, else top skills; empty means all jobs) runs every 6 hours with the job alerts. Its postings, the person's own alerts and new jobs at followed employers are scored against the CV (70%+ strong, 45%+ fair) and shown as signals with Open posting, Save and Dismiss. The role, country and city can be changed; "Use my CV" goes back. Test: test/int/v024.int.ts.
- **AI switching:** quota, rate-limit, billing and busy answers (402/429/5xx and their messages) move to the next model: every free OpenRouter model best first, other Gemini/Groq models, then each backup key in Settings → Writing. Models that ran out rest for 5 minutes (busy) or an hour (quota). Wrong keys fail at once. The model list shows Auto, Free and Paid groups. Tests: test/v024.test.ts, test/int/v024.int.ts.
- **Job title picker:** about 190 predefined titles in 14 groups, and anything typed is kept.
- **Signals Open:** opens the business in place instead of moving to Leads.
- **Names from web results:** page titles such as "Contact us" are skipped; the business name comes from the rest of the title or the domain. Existing leads and their signal titles are repaired on start.

# Earlier: v0.23.0

This audit covers v0.22.0 on 20 Nov 2026. "Verified" means an automated test exercised the real code path; a successful compile is not counted.

## How things were tested

- **Unit tests:** 73, in Node.
- **Integration tests:** 40, in `test/int`, inside Electron's own Node against real SQLite, real SMTP servers, the real local HTTP API, the real CLI and MCP processes and a real webhook receiver.
- **Installed-app smoke test** (`src/main/smoke.ts`, 17 checks): every release installs each installer the way a user would (DMG, silent NSIS install, `apt install` of the .deb), starts the installed app and checks window, first-launch wizard, every screen, workspaces, accessible names, Arabic right-to-left translation, database, IPC, client isolation, sending approval, network guard, packaged CLI and secret storage. The same test passed here on Linux against the built app.
- **Signature verification** per platform in every release; the release notes state whether each build is signed.
- **Live provider checks** (`scripts/live.mjs`): the app's own source code against the real keyless services (OpenStreetMap, Wikidata, NPI, Overture, DNS, Hacker News, Greenhouse, Lever, Ashby, SmartRecruiters, Workday, keyless job boards, a job alert run). They run from CI on every release and are published as `live-providers.json`; they are a report, not a gate.

## Live results (v0.22.0 release, 20 Nov 2026): 10 of 16 answered with real data

- Passed: Nominatim geocoding, Wikidata businesses (QF-009), Wikidata company size (QF-028), NPI registry, DNS checks, Hacker News hiring (QF-097), Workday (QF-095, 400 NVIDIA jobs), keyless job boards (90 jobs), job alert baseline and re-run (QF-107), oversized-response rejection.
- Fixed in 0.22.1 from these results: Greenhouse, Lever and Ashby feeds of big employers are tens of MB and hit the 3 MB limit (now 40 MB for employer feeds); Overture renamed `categories` to `taxonomy`/`basic_category` in its newer releases (now read whichever the file has).
- Confirmed in the v0.22.1 release (14 of 16 live): Overture returned 10 places, Greenhouse 781, Lever 308 and Ashby 187 jobs.
- Not fixed: Overpass was busy at the time (temporary); SmartRecruiters returned no jobs for "Visa" (the test employer may have moved off SmartRecruiters; QF-094 stays Built).

## 0.23.0 (21 Nov 2026)

- **Workspace isolation, completed:**
  - "Approve all" only schedules emails in the selected client workspace.
  - Manually added leads are filed in that workspace.
  - The dashboard, statistics, filters, signal counts, outreach metrics and the send plan read the workspace only. They use temporary views that shadow the tables during a read.
  - Search stop, pause, resume and log check that the search belongs to the workspace, and so does undoing a merge.
  - "Mark all seen" only marks the workspace's signals.
- **Jobs:**
  - Jobs that name another country, or a city that is only abroad, are left out when a country is chosen.
  - A search can be stopped at once.
  - Bot checks and HTML are never shown as a job description; Google Jobs links show the listing summary.
- **Writing model:**
  - OpenRouter with a key but no model now picks a free model (best first) and tries the next one if a free model is busy. Before this, nothing was used.
  - The Writing settings explain that a model never finds more leads or jobs; it writes, summarises and ranks.
- **Providers:**
  - Overpass uses four public servers in turn and reports the real cause.
  - Wikidata dates keep only the precision Wikidata gives ("2022", not "2022-00-00"), which also fixes company growth figures.
  - The live check now separates temporary provider outages from real failures and tests more SmartRecruiters employers, search preview and source diagnostics.
- **Localization:** about 100 main-process error messages are translated into all five languages.
- **Docker-free self-check:** the installed-app smoke test also draws the lead map and the tasks week view (17 checks).
- **Verification:** test/int/verify.int.ts checks 19 earlier "Built" items end to end. Nine items whose only remaining step is the owner's account are now marked **Blocked (needs owner credentials)**, not Built.

## Critical fixes (P0), 0.22

| Issue | Fix | Evidence |
|---|---|---|
| API keys and credentials could follow a redirect to another site | Authorization, Cookie and any key/token/secret/auth header are dropped when a redirect changes origin (scheme, host or port); key-like query parameters are removed too; https → http redirects carrying credentials or a body are refused; 307/308 never resend a body to another origin | test/hardening.test.ts |
| Client workspaces were only separated at duplicate checks | When a client workspace is selected, every IPC channel that takes a record ID checks it belongs to that client, list channels are filtered, lead queries and file exports are forced to the workspace, deals/tasks/forecast are scoped in SQL, exports and CRM/database syncs drop other clients' leads, watches and campaigns belong to the workspace they were made in, searches keep their workspace even if the user switches mid-search, automations and webhooks can be limited to one client, and the local API sees the same workspace. "All clients" stays an agency overview | test/int/hardening.int.ts, smoke test |
| Browser DNS rebinding | Hidden browser sessions resolve names with Chromium's own resolver (the answer the page connects with), trust a safe answer for 10 s only, and stop the page if a redirect still comes from a private address. Private-address detection now covers IPv4 inside IPv6 (mapped, compatible, NAT64, 6to4), Teredo, documentation and site-local ranges, and numeric host tricks (2130706433, 0x7f.1); `.lan` and `.home.arpa` are blocked | test/hardening.test.ts, test/int/hardening.int.ts |
| Network limits | At most 6 connections per origin, 15 s connect timeout, bounded header and body timeouts, 5 redirect hops, every hop re-checked; Overture range reads go through the same checks and budgets | code review, test/hardening.test.ts |
| Sending paths | `sendRaw`, the only function that sends email, now re-checks every message: valid single recipient, do-not-contact list (case-insensitive), pause, approved mailbox whose address still matches the approval, today's limit, message size; subjects cannot inject headers; placement tests count towards the daily limit; provider errors are redacted before being stored. WhatsApp Cloud approval is tied to one business number, refuses leads whose source forbids contact, and handles non-JSON errors | test/int/hardening.int.ts, test/int/outreach.int.ts |

## Improvements (P1), 0.22

- **OAuth:** Google and Microsoft have separate settings (Google client ID + secret; Microsoft app ID + tenant). The Google secret is never sent to Microsoft. Old shared settings are migrated by ID format.
- **Overture:** all listing pages, every file footer, antimeridian boxes, better category matching, de-duplication, partial results reported.
- **Job alerts:** 5-minute checks and a check at start, schedule kept from the due time, retries with backoff, per-board baselines, editing an alert's search starts a new baseline, errors shown.
- **Source SDK:** licence terms (export, contact) per source, both off by default; emails are not kept when contact is not allowed; duplicate IDs refused.
- **Oversized responses** are rejected with a clear error instead of being cut off (only the health probe accepts a partial page, and says so).
- **Screens:** a screen that fails to draw shows the error and a retry button instead of blanking the app.

## Outstanding features

- **QF-123 Localization: done.** Every screen in Urdu, Arabic (right to left), Spanish, French and German, 1,158 strings each, numbers in sentences handled by patterns, the user's own data left untranslated. Machine translation; native review is welcome. Error messages produced by the main process are still in English.
- **QF-121 Signing: blocked on certificates.** The pipeline signs and verifies each platform once its secrets exist (docs/CREDENTIALS.md lists exactly what is needed); until then builds are unsigned and verified as unsigned, and the release notes say so.

## Blocked

- **Job boards:** Glassdoor, ZipRecruiter, SEEK/JobStreet/JobsDB, Naukri, Bayt, BDJobs and HelloWork. Their APIs are partner-only or don't exist.
- **Hosted collaboration (QF-057):** needs a sync service that Quarrix does not run.
- **QF-121:** needs Apple and Windows signing certificates.
- **Not done (QF-115, demo data):** intentionally excluded: it conflicts with the owner's "real data only" rule.

## Built, not yet verified live (1 item)

| ID | Feature | Why | What is needed |
|---|---|---|---|
| QF-096 | Personio/Pinpoint connectors | No public keyless employer feed to test against | A live check against a real Personio or Pinpoint board |

Verified live in the v0.23.0 release (17/17 installed-app checks on Windows, macOS and Linux; 17/18 live providers, 1 temporary Overpass outage, 0 failures): QF-011 diagnostics, QF-013 and QF-117 search preview, QF-094 SmartRecruiters.

## Blocked on the owner's credentials (adapters tested against recorded API answers)

QF-039 Hunter, QF-042 Hunter/ZeroBounce, QF-059 Google OAuth, QF-060 Microsoft OAuth, QF-070 placement test (real mailbox), QF-075 SendGrid, QF-085 HubSpot, QF-086 Google Sheets, QF-087 Notion.

## Totals

- Done: 105
- Built: 1
- Blocked: 17
- Partial: 0
- Not done: 1
