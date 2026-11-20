# Final audit, v0.22.1

This audit covers v0.22.0 on 20 Nov 2026. "Verified" means an automated test exercised the real code path; a successful compile is not counted.

## How things were tested

- **Unit tests:** 69, in Node.
- **Integration tests:** 26, in `test/int`, inside Electron's own Node against real SQLite, real SMTP servers, the real local HTTP API, the real CLI and MCP processes and a real webhook receiver.
- **Installed-app smoke test** (`src/main/smoke.ts`, 16 checks): every release installs each installer the way a user would (DMG, silent NSIS install, `apt install` of the .deb), starts the installed app and checks window, first-launch wizard, every screen, workspaces, accessible names, Arabic right-to-left translation, database, IPC, client isolation, sending approval, network guard, packaged CLI and secret storage. The same test passed here on Linux against the built app.
- **Signature verification** per platform in every release; the release notes state whether each build is signed.
- **Live provider checks** (`scripts/live.mjs`): the app's own source code against the real keyless services (OpenStreetMap, Wikidata, NPI, Overture, DNS, Hacker News, Greenhouse, Lever, Ashby, SmartRecruiters, Workday, keyless job boards, a job alert run). They run from CI on every release and are published as `live-providers.json`; they are a report, not a gate.

## Live results (v0.22.0 release, 20 Nov 2026): 10 of 16 answered with real data

- Passed: Nominatim geocoding, Wikidata businesses (QF-009), Wikidata company size (QF-028), NPI registry, DNS checks, Hacker News hiring (QF-097), Workday (QF-095, 400 NVIDIA jobs), keyless job boards (90 jobs), job alert baseline and re-run (QF-107), oversized-response rejection.
- Fixed in 0.22.1 from these results: Greenhouse, Lever and Ashby feeds of big employers are tens of MB and hit the 3 MB limit (now 40 MB for employer feeds); Overture renamed `categories` to `taxonomy`/`basic_category` in its newer releases (now read whichever the file has).
- Confirmed in the v0.22.1 release (14 of 16 live): Overture returned 10 places, Greenhouse 781, Lever 308 and Ashby 187 jobs.
- Not fixed: Overpass was busy at the time (temporary); SmartRecruiters returned no jobs for "Visa" (the test employer may have moved off SmartRecruiters; QF-094 stays Built).

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

## Built, not yet verified live (33 items)

Each release now runs the keyless ones against the real services from CI (live-providers.json on the release page); items that need the owner's own accounts or keys stay here until those are available.

| ID | Feature | Why it is not verified yet | What is needed |
|---|---|---|---|
| QF-002 | Batch search builder | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-011 | Provider connectivity diagnostics | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-012 | Per-provider request budgets | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-013 | Batch preflight/small-sample preview | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-015 | Business search map with clustering | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-026 | Business imagery and profile media | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-029 | Evidence and source provenance per field | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-030 | Field freshness and stale-data warnings | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-031 | Configurable enrichment waterfall | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-032 | Provider conflict reconciliation | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-036 | Business-change watchlists | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-037 | Source snapshots and comparison history | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-039 | Bulk domain-based contact lookup | Needs the live service; this environment cannot reach it | Hunter key |
| QF-040 | Verified source URLs for discovered contacts | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-042 | Optional provider-backed mailbox verification | Needs the live service; this environment cannot reach it | Hunter or ZeroBounce key |
| QF-043 | Bulk email validation queue | Needs the live service; this environment cannot reach it | Hunter or ZeroBounce key |
| QF-045 | Contact freshness and historical changes | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-054 | Calendar-based next-action view | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-059 | Gmail browser-based OAuth | Needs the live service; this environment cannot reach it | Google OAuth client and account |
| QF-060 | Microsoft 365/Outlook OAuth | Needs the live service; this environment cannot reach it | Azure app and Microsoft 365 account |
| QF-062 | Unified replies inbox | Needs the live service; this environment cannot reach it | real IMAP mailbox |
| QF-070 | Optional inbox placement testing | Needs the live service; this environment cannot reach it | mail-tester.com run with a real mailbox |
| QF-072 | Per-mailbox and per-campaign metrics | Needs the live service; this environment cannot reach it | real sends |
| QF-075 | Optional transactional email provider adapter | Needs the live service; this environment cannot reach it | SendGrid key and verified sender |
| QF-085 | HubSpot adapter | Needs the live service; this environment cannot reach it | HubSpot private app token |
| QF-086 | Google Sheets connector | Needs the live service; this environment cannot reach it | Google OAuth client with Sheets |
| QF-087 | Notion connector | Needs the live service; this environment cannot reach it | Notion integration token |
| QF-088 | n8n/Zapier adapters | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-090 | Approved-source browser extension | Needs the live service; this environment cannot reach it | Chrome with the extension loaded |
| QF-094 | SmartRecruiters connector | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-096 | Personio/Pinpoint connectors | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-113 | Job result exports | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-117 | Advanced search preview and estimate | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |

## Totals

- Done: 82
- Built: 33
- Blocked: 8
- Partial: 0
- Not done: 1
