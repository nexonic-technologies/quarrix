# Quarrix backlog status (QF-001 to QF-124)

Source: Quarrix_Missing_Features_Backlog.md. An item is Done only when the listed check passes. Partial means some groundwork exists but the item is not complete end to end.

| ID | Feature | Pri | Status | Where | Verified by |
|---|---|---|---|---|---|
| QF-001 | Persisted pause/resume checkpoints | P1 | To do |  |  |
| QF-002 | Batch search builder | P1 | To do |  |  |
| QF-003 | Interactive radius and polygon search | P2 | To do |  |  |
| QF-004 | Geographic grid coverage | P2 | To do |  |  |
| QF-005 | Overture Maps connector | P1 | To do |  |  |
| QF-006 | Socrata open-data adapter | P2 | To do |  |  |
| QF-007 | ArcGIS public-layer adapter | P2 | To do |  |  |
| QF-008 | US NPI healthcare registry adapter | P2 | To do |  |  |
| QF-009 | Wikidata business source | P3 | To do |  |  |
| QF-010 | Source capability catalog | P1 | To do |  |  |
| QF-011 | Provider connectivity diagnostics | P1 | To do |  |  |
| QF-012 | Per-provider request budgets | P1 | To do |  |  |
| QF-013 | Batch preflight/small-sample preview | P1 | To do |  |  |
| QF-014 | Separated browser navigation workers | P0 | Done | sources/gmaps.ts pageHtml (own window, own session, own queue) | manual (Electron) |
| QF-015 | Business search map with clustering | P2 | To do |  |  |
| QF-016 | Optional company website lookup | P2 | To do |  |  |
| QF-017 | Contact-source permissions registry | P1 | To do |  |  |
| QF-018 | Company-versus-branch hierarchy | P1 | To do |  |  |
| QF-019 | Multi-contact relationships | P1 | To do |  |  |
| QF-020 | Operating-hours data | P2 | To do |  |  |
| QF-021 | Business open/closed status tracking | P2 | To do |  |  |
| QF-022 | Price tier and amenities fields | P3 | To do |  |  |
| QF-023 | Booking, ordering and menu links | P2 | To do |  |  |
| QF-024 | Place listing IDs and canonical URLs | P1 | To do |  |  |
| QF-025 | Review distribution and trends | P2 | To do |  |  |
| QF-026 | Business imagery and profile media | P3 | To do |  |  |
| QF-027 | Website technology inventory | P2 | To do |  |  |
| QF-028 | Company size and growth fields | P3 | To do |  |  |
| QF-029 | Evidence and source provenance per field | P1 | To do |  |  |
| QF-030 | Field freshness and stale-data warnings | P1 | Partial | leads.checked_at + weekly recheck (signals.ts) | typecheck only |
| QF-031 | Configurable enrichment waterfall | P1 | To do |  |  |
| QF-032 | Provider conflict reconciliation | P2 | To do |  |  |
| QF-033 | Explainable ICP fit rules | P1 | To do |  |  |
| QF-034 | Industry-specific qualification presets | P1 | To do |  |  |
| QF-035 | A/B/C lead quality tiers | P2 | To do |  |  |
| QF-036 | Business-change watchlists | P2 | Partial | signals.ts watches + new_listing / hiring signals (0.11.0) | typecheck only |
| QF-037 | Source snapshots and comparison history | P2 | To do |  |  |
| QF-038 | Buying-signal confidence controls | P2 | Partial | signals table: level, detail, date; not yet a confidence field | typecheck only |
| QF-039 | Bulk domain-based contact lookup | P2 | To do |  |  |
| QF-040 | Verified source URLs for discovered contacts | P1 | To do |  |  |
| QF-041 | Email syntax and domain-level checks as separate statuses | P1 | To do |  |  |
| QF-042 | Optional provider-backed mailbox verification | P2 | To do |  |  |
| QF-043 | Bulk email validation queue | P2 | To do |  |  |
| QF-044 | Role and department contact filters | P2 | To do |  |  |
| QF-045 | Contact freshness and historical changes | P1 | Partial | bounces suppress and cancel (mail.ts); no history view | — |
| QF-046 | Contact do-not-solicit enforcement | P0 | Done | safety.ts outreachBlock; outreach.ts, mail.ts | test/safety.test.ts |
| QF-047 | Kanban pipeline view | P1 | To do |  |  |
| QF-048 | Deal and opportunity records | P1 | To do |  |  |
| QF-049 | Tasks and reminders | P1 | To do |  |  |
| QF-050 | Custom fields and field types | P2 | To do |  |  |
| QF-051 | Customizable saved views | P2 | To do |  |  |
| QF-052 | Companies, contacts, locations and deals data model | P1 | To do |  |  |
| QF-053 | Data merge review UI | P2 | To do |  |  |
| QF-054 | Calendar-based next-action view | P2 | To do |  |  |
| QF-055 | Opportunity forecasting dashboard | P2 | Partial | Dashboard funnel (0.10.0); no deal values yet | typecheck only |
| QF-056 | Client/project workspaces | P3 | To do |  |  |
| QF-057 | Role-based collaboration (optional) | P3 | To do |  |  |
| QF-058 | Fix ordered follow-up state machine | P0 | Done | safety.ts DUE_SQL; db.dueMessages | test/safety.test.ts (SQLite) |
| QF-059 | Gmail browser-based OAuth | P1 | To do |  |  |
| QF-060 | Microsoft 365/Outlook OAuth | P1 | To do |  |  |
| QF-061 | Multiple connected sending accounts | P2 | To do |  |  |
| QF-062 | Unified replies inbox | P2 | To do |  |  |
| QF-063 | Reply intent labeling | P2 | To do |  |  |
| QF-064 | Visual sequence editor | P1 | To do |  |  |
| QF-065 | Pre-send dry run | P1 | To do |  |  |
| QF-066 | Explicit send authorization | P1 | To do |  |  |
| QF-067 | IANA timezone-aware scheduling | P1 | To do |  |  |
| QF-068 | Bounce/complaint circuit breakers | P1 | To do |  |  |
| QF-069 | Deliverability DNS diagnostics | P2 | To do |  |  |
| QF-070 | Optional inbox placement testing | P3 | To do |  |  |
| QF-071 | A/B tests for approved messaging | P2 | To do |  |  |
| QF-072 | Per-mailbox and per-campaign metrics | P2 | To do |  |  |
| QF-073 | Campaign attention center | P1 | To do |  |  |
| QF-074 | Cross-campaign contact exclusion rules | P1 | To do |  |  |
| QF-075 | Optional transactional email provider adapter | P3 | To do |  |  |
| QF-076 | No-code automation builder | P2 | To do |  |  |
| QF-077 | Workflow templates | P2 | To do |  |  |
| QF-078 | Conditional routing | P2 | To do |  |  |
| QF-079 | Formula and computed-field engine | P3 | To do |  |  |
| QF-080 | Normalized source plugin SDK | P2 | To do |  |  |
| QF-081 | Local REST API (opt-in) | P2 | To do |  |  |
| QF-082 | Command-line interface | P2 | To do |  |  |
| QF-083 | Optional MCP server | P3 | To do |  |  |
| QF-084 | Generic webhook actions | P2 | To do |  |  |
| QF-085 | HubSpot adapter | P3 | To do |  |  |
| QF-086 | Google Sheets connector | P3 | To do |  |  |
| QF-087 | Notion connector | P3 | To do |  |  |
| QF-088 | n8n/Zapier adapters | P3 | To do |  |  |
| QF-089 | Structured export adapters | P3 | To do |  |  |
| QF-090 | Approved-source browser extension | P3 | To do |  |  |
| QF-091 | Greenhouse company jobs connector | P1 | To do |  |  |
| QF-092 | Lever jobs connector | P1 | To do |  |  |
| QF-093 | Ashby jobs connector | P1 | To do |  |  |
| QF-094 | SmartRecruiters connector | P2 | To do |  |  |
| QF-095 | Workday careers connector | P2 | To do |  |  |
| QF-096 | Personio/Pinpoint connectors | P2 | To do |  |  |
| QF-097 | Hacker News hiring posts | P2 | To do |  |  |
| QF-098 | Glassdoor search connector | P2 | To do |  |  |
| QF-099 | ZipRecruiter connector | P2 | To do |  |  |
| QF-100 | SEEK, JobStreet and JobsDB connectors | P2 | To do |  |  |
| QF-101 | Naukri India connector | P2 | To do |  |  |
| QF-102 | Bayt Middle East connector | P2 | To do |  |  |
| QF-103 | BDJobs and HelloWork connectors | P3 | To do |  |  |
| QF-104 | Applicant tracking system detection | P1 | To do |  |  |
| QF-105 | Application URL validation | P1 | To do |  |  |
| QF-106 | Fresh-jobs-since-last-run mode | P1 | To do |  |  |
| QF-107 | Scheduled job alerts | P1 | To do |  |  |
| QF-108 | Job application state accuracy | P1 | Done | Jobs.tsx: Apply sets "Opened", never "Applied" | manual |
| QF-109 | Country-specific regional salary normalization | P2 | To do |  |  |
| QF-110 | Salary floor and radius filters | P2 | To do |  |  |
| QF-111 | Hide recruiters and company preferences | P2 | To do |  |  |
| QF-112 | Job post provenance and age | P1 | To do |  |  |
| QF-113 | Job result exports | P2 | To do |  |  |
| QF-114 | Guided first-launch wizard | P1 | To do |  |  |
| QF-115 | One-click offline sample/demo data | P1 | To do |  |  |
| QF-116 | Distinct Business and Career workspaces | P1 | To do |  |  |
| QF-117 | Advanced search preview and estimate | P1 | To do |  |  |
| QF-118 | Safe export wizard with field mapping | P2 | To do |  |  |
| QF-119 | Encrypted database backups and recovery | P1 | To do |  |  |
| QF-120 | Per-feature privacy disclosures | P1 | To do |  |  |
| QF-121 | App signing and macOS notarization | P1 | To do |  |  |
| QF-122 | Accessibility and keyboard support | P2 | To do |  |  |
| QF-123 | Localized interface and regional defaults | P3 | To do |  |  |
| QF-124 | Trusted source audit logs and diagnostics | P1 | To do |  |  |

## Hardening items (from the backlog's "requires improvement" list)

| # | Item | Status | Where | Verified by |
|---|---|---|---|---|
| 1 | Follow-up order, NULL due dates | Done | safety.ts `DUE_SQL` | test/safety.test.ts |
| 2 | SSRF: private IPs, DNS check, checked redirects, 3 MB cap | Done | util.ts `fetchText`, `assertPublicUrl`; gmaps.ts `openPage` | test/safety.test.ts |
| 3 | Domain-only merges of chain branches | Done | safety.ts `sameBusiness`; db.ts `findDuplicate` | test/safety.test.ts |
| 4 | MX shown as "ok" | To do | enrich.ts / Leads.tsx | — |
| 5 | Time zones from longitude | To do | mail.ts `inWindow` | — |
| 6 | noSolicit must block outreach | Done | safety.ts `outreachBlock` | test/safety.test.ts |
| 7 | Report captcha / broken selectors | Partial | gmaps.ts throws captcha and bot-check errors | — |
| 8 | Plain-text secret fallback | Done | settings.ts: session-only, never written; warning in Settings | manual |
| 9 | Apply marked Applied | Done | Jobs.tsx | manual |
| 10 | IPC sender check, external URL allow-list, blocked navigation | Done | index.ts | test/safety.test.ts (URL rules) |
| 11 | Regression tests | Started | test/safety.test.ts (7 tests); CI runs typecheck, tests, npm audit, build | CI |
| 12 | Theme forced light | Kept on purpose | the owner asked for light only | — |
