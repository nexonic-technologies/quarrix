# Final audit, v2.1.0 candidate

## v2.1.0 (candidate)

- Discovery and onboarding: pointer-reactive dashboard lighting, reduced-motion fallback, progress indicator, keyboard focus containment and inert background. No continuous decorative animation.
- Data review: explicit evidence reasons, current-page quality counts, client-scoped duplicate grouping before the group limit, debounced queries and retryable errors.
- Provider health: per-source checks, session timestamps, bounded concurrency, one-minute cache, shared in-flight checks and budget guards. Reachability is not proof of usable search results; restrictions are respected.
- Local verification: 105 unit tests, 75 integration tests and production build passed. Release installers and live providers must still pass the release workflow; the 17 external blockers remain.

## v2.0.0 (released)

- Global data (v1.2): public regional source directory for Pakistan, US, UK, Canada, EU and UAE; Canada Job Bank, UK Find a job and EURES may be saved manually. Directory links open the official public service, not automated extraction. SEC operating-company lookup by public CIK uses the documented [EDGAR API](https://www.sec.gov/about/developer-resources); it does not verify licensing or individual contacts. Official US private-sector average hourly earnings use BLS series CES0500000003 via the [BLS API](https://www.bls.gov/developers/); no claim of occupation-specific or predicted salary. Other national wage sources are links. Live service checks are included for the eventual release workflow, not assumed to have passed locally.
- Career (v1.3): posting-grounded skill wording versus CV text, with occupation-catalog terms, optional official training search and upcoming seven-day application planner. Not an ATS verdict or an eligibility prediction.
- Business (v1.4): customer grouping by grade/status, rating and website coverage comparisons of stored samples, currency-separated sales figures, proposal validity and exact minor-unit percentage discounts. No market-share inference or fabricated competitor data.
- Unified center (v1.5): due applications, scoped CRM tasks and public watchlist deadlines; controls to pause/resume saved searches; optional local daily desktop count reminder, claimed at most once per client/date. No automatic message or application sending.
- Production (v2.0): lazy discovery screens, hidden-window dashboard refresh suppression, locale strings, focused and integration regressions, named keyboard controls and automated accessibility rule gate in CI. Signing remains conditional on real credentials and notarization account; unsigned packages are not represented as signed.
- Release verification: 101 unit tests, 73 integration tests, accessibility checks and dependency audit passed. [Published v2.0.0](https://github.com/nexonic-technologies/quarrix/releases/tag/v2.0.0) confirms 162/162 installed-app checks, 23/24 live providers including SEC and BLS, one temporary Overpass outage and zero provider failures. Windows and Intel Mac installers are unsigned; Apple Silicon is ad-hoc signed. The 17 external blockers remain unchanged.

## Post-v2.0.0 Overpass resilience candidate

Bounded failover on transient network/service errors, no retry on refusals, rate limits, budget or cancellation, and smaller central-Austin live probe. Unreadable and incomplete responses are not counted as successful data. Live verification remains pending; the public provider's availability is not under Quarrix control. Signing requires genuine owner-provided credentials and is not replaced with self-signed certificates.

## v1.1.0 Verified Intelligence (released)

Two dashboard entry points select the matching workspace and open its search. Optional recommendations use up to 100 grade-ranked records in the selected client scope, and saved jobs with recorded match scores; no invented leads or automatic application/contact action. Lead evidence labels use the recorded website check and date, conflict flags, current mailbox status and check date. Changed addresses invalidate previous verification. Saved/search vacancies show contextual warnings, older/reposted states, and current-session corroboration after user-requested checks. A job warning or a registry name match is not a guarantee of employer authenticity. The [GLEIF public API](https://www.gleif.org/en/lei-data/gleif-api/) is queried only on request with legal name and ISO country code, capped at 20 response records; exact name and country candidates include legal and registration status. No match is not proof of nonexistence; many entities lack an LEI. Salary comparisons are median advertised annualized endpoints within the current result sample, grouped by currency, not official market wage benchmarks. [PR CI](https://github.com/nexonic-technologies/quarrix/actions/runs/44971737859) passed 96 unit and 71 integration tests, and main CI passed. [Release verification](https://github.com/nexonic-technologies/quarrix/releases/tag/v1.1.0) confirms 156/156 installed-app checks and 21/22 live providers returned real data, including GLEIF; one temporary Overpass outage, zero provider failures. Existing 17 external blockers remain.

## Post-1.0 desktop quality pass

- Navigation validates stored routes and preserves the route when using the keyboard skip link. Career and business modes now show the relevant dashboard cards and navigation groups.
- Lead queries ignore superseded responses; switching client clears selection, open details and pending exports before the new scope loads. Pagination recovers when results shrink.
- Localized select labels retain canonical status and filter values, and superseded language catalogue responses cannot overwrite the active language.
- Watchlist URL edits reject duplicates in the record's own client, even from the all-client overview. Dashboard and job-detail loading handle failures and stale responses.
- Desktop styling uses clearer typography, quieter brand accents, grouped navigation, scrollable sidebar, responsive cards and wrapped action bars. Dashboard sparklines no longer overlap KPI labels; zero-count funnel steps display zero width. Existing screens, documents and local data are retained.
- Verification: regression unit and SQLite integration tests plus desktop smoke checks for minimum window layout, client changes and localized status values. The CI workflow now runs the built app before merge. The [initial quality-pass CI](https://github.com/nexonic-technologies/quarrix/actions/runs/44968122140) passed 93 unit tests, 70 integration tests, 25 desktop checks, typecheck, dependency audit and build; the screenshot informed the final chart refinements. Installer verification remains pending for a subsequent release. The 17 external blockers remain unchanged.

## v1.0.0 production release (includes v0.31.0 and v0.32.0)

- Proposal studio: editable templates, itemized quotations using integer minor-unit arithmetic, manually recorded proposal status, per-business persistence, and offline PDF/Word export. Market Intelligence also exports PDF/Word summaries with the configured business name and sample limitations.
- Public opportunities: official government job and procurement portal directory for Pakistan, the US, the UK and EU procurement. The documented [TED search API](https://docs.ted.europa.eu/api/latest/search.html) returns recent standard contract notices, with notice identifiers and provider-supplied deadlines. Other portal entries are browser links, not claimed live APIs. Users manually confirm eligibility and deadlines in a scoped local watchlist. No automatic submission or background scraping.
- Production checks: existing CI, localization, migration and data-integrity tests, dependency audit, and installed-app smoke tests extended for proposal PDF rendering and public opportunity storage. [Main CI](https://github.com/nexonic-technologies/quarrix/actions/runs/44965442624) and [release workflow](https://github.com/nexonic-technologies/quarrix/actions/runs/44965442619) passed. [Published release verification](https://github.com/nexonic-technologies/quarrix/releases/tag/v1.0.0) confirms 138/138 installed-app checks (23/23 each across six configurations), 20/21 live providers returned real data, one temporary Overpass outage, and zero provider failures. Windows x64/ARM64 and Intel macOS installers remain unsigned; Apple Silicon macOS is ad-hoc signed only, and Linux installers have published SHA-256 checksums. The 17 previously identified external blockers remain; signing still requires owner certificates and no partner-only API has been bypassed.

## v0.30.0 (released)

Market Intelligence uses the existing local business database, with country and category filters and grouping by category, country, city, source or linked company. It distinguishes locations from linked companies, reports unlinked records and coverage, averages only recorded fit scores, and counts checks from the last 90 days. The group view and CSV show the largest 100 groups; totals cover all matching records. These are sample summaries, not market size, market share or forecast estimates. No network requests or individual contact details are included. [CI](https://github.com/nexonic-technologies/quarrix/actions/runs/44962900415) passed. [Release verification](https://github.com/nexonic-technologies/quarrix/releases/tag/v0.30.0) confirms 126/126 installed-app checks across six configurations. Live results: 19/20 returned real data, one temporary Overpass outage, no provider failures. The 17 external blockers remain unchanged.

## v0.29.0 (released)

Application Studio adds text-based resume review, interview practice prompts, private notes and document drafts, and application deadlines, interview dates and follow-ups. Saved application metadata persists across status changes and is removed when the user confirms removal of the application. The planner is local and does not send messages or apply automatically. CI passed; [v0.29.0 release](https://github.com/nexonic-technologies/quarrix/releases/tag/v0.29.0) verifies 120/120 installed-app checks, 19/20 live providers returned data with one temporary Overpass outage and no provider failures. External blockers remain unchanged.

## v0.28.0 (released)

Job trust checks report observable evidence, not a fraud verdict. On request, Quarrix checks the listing and a user-supplied employer careers page, matches the exact vacancy and company, and displays contextual warning excerpts and the evidence score. The [method and limitations](JOB_TRUST.md) are documented. [CI](https://github.com/nexonic-technologies/quarrix/actions/runs/44933745481) passed. [Release verification](https://github.com/nexonic-technologies/quarrix/releases/tag/v0.28.0) confirms 114/114 checks across six installed-app runs. Live providers: 19/20 returned real data, one temporary Overpass outage, zero failures; the 17 external blockers remain unchanged.

## v0.27.0 Career Intelligence (released)

The career explorer uses 1,016 official occupation records and rated skills for 910 occupations, plus software examples. It works without an account, network or CV; shows explicit matching evidence and skills to explore, not a hiring probability. Data attribution and regeneration are documented in [CAREER_DATA.md](CAREER_DATA.md). [CI](https://github.com/nexonic-technologies/quarrix/actions/runs/44931439366) passed; [release verification](https://github.com/nexonic-technologies/quarrix/releases/tag/v0.27.0) confirms 108/108 checks across six native installed-app runs, including career exploration. Live results: 19/20 providers returned data, one temporary Overpass outage, zero provider failures. The 17 previously documented external blockers remain unchanged.

## v0.26.1 (released)

- Proof reports now insert sent metadata and the selected mailbox together. Provider delivery attempts reserve persistent, immutable allowance before delivery, and their subsequent sent message records do not count twice. Ambiguous provider failures conservatively retain the reservation. Historical reports whose original mailbox was not recorded cannot be reattributed reliably.
- Duplicate review groups compatible locations independently. Merges collect notes, tags, emails, custom fields and field conflicts; incompatible contact records or source permissions abort transactionally. Undo refuses changed records and older merges without verifiable snapshots.
- Release verification reports use platform-specific filenames and verify both macOS and Windows architectures. Native Intel macOS and Windows ARM64 draft-installer smoke jobs are required for publication; the Rosetta timeout is avoided by running natively.
- Overpass stops on explicit rate limits/access refusals and rejects incomplete provider data; later-page job-board errors preserve results with a partial-result warning. Live checks: 19/20 providers returned real data, one temporary Overpass outage, zero provider failures. The 17 existing external blockers remain unchanged.
- Verified: [CI](https://github.com/nexonic-technologies/quarrix/actions/runs/44927836513) passed typecheck, tests, build and dependency audit; 60/60 integration tests, zero reported vulnerabilities. [Release](https://github.com/nexonic-technologies/quarrix/releases/tag/v0.26.1) published after six installed-app smoke runs passed 17/17 checks each (Windows x64 and ARM64, macOS Intel and Apple Silicon, Linux deb and AppImage). SHA-256 checksums published; installers are unsigned except Apple Silicon's ad-hoc signature. Developer ID and Windows signing certificates remain external blockers.

## v0.26.0 (data integrity milestone)

Fixed (tests: test/int/v026.int.ts):
- **Critical: contacts lost when merging duplicates.** Moving a duplicate's rows used `UPDATE OR IGNORE`; a contact already on the kept lead (same name and email) stayed on the removed lead and was deleted with it, and undo did not bring it back. Merge now saves every row of the removed leads in full first, drops only exact copies, and undo restores every row with its original ID and lead.
- **Merge missed lead-linked tables.** The list of tables was fixed in code (automation log rows were left pointing at deleted leads). Tables are now found from the database schema.
- **Unsafe undo.** Undoing an earlier merge after the same leads were merged again, after the kept lead was deleted, or when a lead with the same ID exists again could corrupt data. Each case is refused with a clear message; later merges are undone first.
- **Critical: sent-email history could be used to bypass limits.** Deleting a sent message or its lead lowered today's count and the warm-up age. Every send (outreach, placement tests, test emails) is now written by database triggers to an append-only send log that cannot be changed and cannot be deleted for 60 days; daily limits and warm-up read from it. Sent messages cannot be deleted, and their status, text, mailbox, step and send time are locked by a trigger as well as by the IPC check. Leads (with their messages) can still be deleted; the send still counts.
- **Test-email limit reset on restart** (it was kept in memory). It is now counted in the send log and recorded before sending, so parallel clicks cannot pass the cap of 5 per day.
- **Migration:** existing sent messages and placement tests are copied into the send log once on first start, so limits and warm-up continue; no existing data is changed.

Checked again, no change needed: workspace guards on every mutating IPC call (0.25 allowlist; merges, undo and messages stay within the workspace), franchise grouping, Workday and Overpass retries, job alerts, CV matching, AI failover and cancellation (0.25 tests still pass).

Verification: typecheck, 80 unit tests and the integration suite (including v026) run in CI on every pull request; release builds run the installed-app smoke test on every platform. Results are in the release notes.

Still blocked (unchanged, see below): provider accounts, OAuth apps, SendGrid, HubSpot, Sheets, Notion, inbox placement, hosted collaboration, partner-only job boards, code signing; Windows ARM64 verified by CPU type only.

Totals: Done 106, Built 0, Blocked 17, Not done 1 (QF-115, excluded).

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

Release evidence (v0.25.0): installed-app smoke 17/17 on Windows x64, macOS arm64, Linux deb and Linux AppImage; CPU types verified for macOS arm64/x86_64 and Windows AMD64/ARM64. Live providers 18/20: Personio (personio.jobs.personio.de) and Pinpoint (workwithus.pinpointhq.com) answered with real postings, so QF-096 is Done. Overpass was unreachable from the runner (outage). NVIDIA's Workday site answered the runner with a web page instead of job data (a bot check on GitHub's network, reported clearly by the new handling; Workday itself was verified in v0.23.0).

Totals: Done 106, Built 0, Blocked 17, Not done 1 (QF-115, demo data, excluded by the owner's real-data rule).

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

## Built, not yet verified live (0 items)

None. QF-096 was verified live in v0.25.0.

## Blocked on the owner's credentials (adapters tested against recorded API answers)

QF-039 Hunter, QF-042 Hunter/ZeroBounce, QF-059 Google OAuth, QF-060 Microsoft OAuth, QF-070 placement test (real mailbox), QF-075 SendGrid, QF-085 HubSpot, QF-086 Google Sheets, QF-087 Notion.

## Totals

- Done: 106
- Built: 0
- Blocked: 17
- Partial: 0
- Not done: 1
