# Final audit, v0.21.0

This audit covers v0.21.0 on 20 Nov 2026. It records what the code does and how each part was checked. "Verified" means an automated test exercised the real code path. A successful compile is not counted as verification.

## How things were tested

- **Unit tests:** 59, run in Node.
- **Integration tests:** 17, in `test/int`. They run inside Electron's own Node runtime against:
  - real SQLite (the app's own better-sqlite3 build) and real files;
  - real SMTP servers receiving mail from Quarrix's sending code;
  - the real local HTTP API;
  - the real `quarrix` CLI and MCP server as separate processes;
  - a real HTTP server checking webhook signatures.
- **Checks on every push:** CI runs the type check, both test suites, a production dependency audit (no high or critical issues) and the build. The release workflow runs the same tests before building the Mac, Windows and Linux installers.
- **Not tested here:** no live tests used third-party accounts. None were available, and this environment cannot reach the public internet. Nothing below claims otherwise.

## Critical fixes (P0), all with tests

| Issue | Fix | Evidence |
|---|---|---|
| Leads from different clients could merge and share companies | Duplicate checks, companies, branches and merges are limited to one client workspace; the 0.20 company table is migrated | test/int/data.int.ts |
| Sending could fall back to another mailbox | Removed. A missing mailbox stops the sequence with a reason. Sending needs a connected, approved mailbox whose current address matches the approval | test/int/outreach.int.ts |
| DNS rebinding and private addresses | Every request is checked when it connects, on the IP actually used. Hidden browser windows check DNS before each request, and block downloads and unsafe navigation | test/int/api.int.ts, test/safety.test.ts |
| Outgoing paths without the rules | Report emails, test emails, placement tests and WhatsApp now have approval, do-not-contact checks, consent (WhatsApp) and daily limits. Report emails count towards the limit | test/int/outreach.int.ts (sequence paths); others checked by code review and typecheck |

## Other fixes (P1)

- **Dev server:** the main window and the IPC check now accept exactly the `QUARRIX_DEV_URL` origin (they used to check an unused variable).
- **Dashboard email counts:** "confirmed" counts only verified emails; deliverable domains are counted separately.
- **Approvals:** approving is refused when no approved mailbox exists.
- **Results with no map position:** these are dropped when their country or city says they are elsewhere (`placeMatches`, tested).
- **Job distance:** country names are skipped, a country named in the location is respected, district suffixes are ignored, and city lookup stays within the country (tested).

## Partial items now complete

- **Overture:** reads the live release files directly (no query API exists).
- **Company size and growth:** from Wikidata, by official website.
- **Source SDK:** documented in docs/SOURCE_SDK.md.
- **Star distribution:** only shown when it adds up to the review count.

## Still partial

- **QF-123 Localization:** menus, titles and the workspace switch are in 6 languages, with right-to-left layout. About 900 other strings need professional translation.
- **QF-121 Signing:** works once the certificate secrets are added (docs/CREDENTIALS.md).

## Blocked

- **Job boards:** Glassdoor, ZipRecruiter, SEEK/JobStreet/JobsDB, Naukri, Bayt, BDJobs and HelloWork. Their APIs are partner-only or don't exist.
- **Hosted collaboration (QF-057):** needs a sync service that Quarrix does not run.
- **Not done (QF-115, demo data):** conflicts with the owner's "real data only" rule.

## Built, not yet verified live (45 items)

| ID | Feature | Why it is not verified yet | What is needed |
|---|---|---|---|
| QF-002 | Batch search builder | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-005 | Overture Maps connector | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-009 | Wikidata business source | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-011 | Provider connectivity diagnostics | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-012 | Per-provider request budgets | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-013 | Batch preflight/small-sample preview | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-015 | Business search map with clustering | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-017 | Contact-source permissions registry | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-026 | Business imagery and profile media | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-028 | Company size and growth fields | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
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
| QF-093 | Ashby jobs connector | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-094 | SmartRecruiters connector | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-095 | Workday careers connector | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-096 | Personio/Pinpoint connectors | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-097 | Hacker News hiring posts | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-107 | Scheduled job alerts | Needs the live service; this environment cannot reach it | internet access to job boards over time |
| QF-113 | Job result exports | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-114 | Guided first-launch wizard | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-116 | Distinct Business and Career workspaces | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-117 | Advanced search preview and estimate | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-120 | Per-feature privacy disclosures | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |
| QF-122 | Accessibility and keyboard support | Needs the live service; this environment cannot reach it | A run in the installed app with internet access |

## Totals

- Done: 69
- Built: 45
- Blocked: 7
- Partial: 2
- Not done: 1
