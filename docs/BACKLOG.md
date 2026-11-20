# Quarrix backlog status (QF-001 to QF-124)

Source: Quarrix_Missing_Features_Backlog.md. **Done** = built and covered by an automated test (unit tests in Node; integration tests in test/int run in Electron's own Node against real SQLite, real SMTP servers, a real HTTP API, and the real CLI and MCP processes). **Built** = implemented and type-checked, but only checked by hand or in the browser preview; it still needs a live run in the app. **Partial** = some of the item exists, not end to end. **Blocked** = cannot be done with authorised access today (reason given).

| ID | Feature | Pri | Status | Where | Verified by |
|---|---|---|---|---|---|
| QF-001 | Persisted pause/resume checkpoints | P1 | Done | Interrupted searches go back in the queue at start-up (checkpoint per source and area) | test/int/records.int.ts |
| QF-002 | Batch search builder | P1 | Built | jobs.queueBatch, search_templates table, FindTools BatchModal | preview UI |
| QF-003 | Interactive radius and polygon search | P2 | Done | Circle or drawn polygon (FindTools MapPicker); geo.inPolygon/polygonCircle; grid limited to the polygon | test/safety.test.ts (polygon) |
| QF-004 | Geographic grid coverage | P2 | Done | geo.ts gridCells/zoomFor; Google Maps grid in jobs.ts | test/discovery.test.ts |
| QF-005 | Overture Maps connector | P1 | Built | sources/overture.ts: every listing page (continuation tokens), every file footer read so no region is skipped, antimeridian boxes split, plural/category matching, read limit reported as partial, budgets and private-address checks on range reads | test/hardening.test.ts; live check in the release (live-providers.json) |
| QF-006 | Socrata open-data adapter | P2 | Done | sources/opendata.ts searchSocrata; Settings → Sources feeds | test/discovery.test.ts (recorded shape) |
| QF-007 | ArcGIS public-layer adapter | P2 | Done | sources/opendata.ts searchArcgis | test/discovery.test.ts (recorded shape) |
| QF-008 | US NPI healthcare registry adapter | P2 | Done | sources/opendata.ts searchNpi (NPI-1/NPI-2) | test/discovery.test.ts (recorded shape) |
| QF-009 | Wikidata business source | P3 | Built | sources/opendata.ts searchWikidata (SPARQL) | typecheck; needs live run |
| QF-010 | Source capability catalog | P1 | Done | sources/catalog.ts; SourcesPanel | test/discovery.test.ts |
| QF-011 | Provider connectivity diagnostics | P1 | Built | health.ts checkSources; SourcesPanel "Check all sources" | typecheck; needs live run |
| QF-012 | Per-provider request budgets | P1 | Built | budget.ts (host-based counting), provider_usage table, limits in Settings | typecheck; needs live run |
| QF-013 | Batch preflight/small-sample preview | P1 | Built | jobs.previewSearch; FindTools PreviewModal | preview UI |
| QF-014 | Separated browser navigation workers | P0 | Done | sources/gmaps.ts pageHtml (own window, own session, own queue) | manual (Electron) |
| QF-015 | Business search map with clustering | P2 | Built | FindTools LeadMap (Leaflet + markercluster), Leads → Map | preview UI |
| QF-016 | Optional company website lookup | P2 | Done | sources/lookup.ts findWebsite + websiteEvidence; provenance.website | test/discovery.test.ts (evidence rule) |
| QF-017 | Contact-source permissions registry | P1 | Done | Catalog export/contact flags; Source SDK files declare their own terms (default: neither); exports, CRM syncs and every outreach path enforce them | test/hardening.test.ts, test/int/hardening.int.ts |
| QF-018 | Company-versus-branch hierarchy | P1 | Done | Companies per client workspace; branches of a chain share their client's company | test/int/data.int.ts |
| QF-019 | Multi-contact relationships | P1 | Done | contacts table, role filter | test/int/records.int.ts |
| QF-020 | Operating-hours data | P2 | Done | Hours from OSM opening_hours, Google Maps and schema.org (intel.osmDetails/schemaDetails) | test/formula.test.ts |
| QF-021 | Business open/closed status tracking | P2 | Done | Status operational / temporarily / permanently closed (OSM, Google Maps) | test/formula.test.ts |
| QF-022 | Price tier and amenities fields | P3 | Done | Price level, amenities, payment methods with source label | test/formula.test.ts |
| QF-023 | Booking, ordering and menu links | P2 | Done | intel.actionLinks → leads.details.links | test/intel.test.ts |
| QF-024 | Place listing IDs and canonical URLs | P1 | Done | intel.listingUrl; Evidence card "open" | test/intel.test.ts |
| QF-025 | Review distribution and trends | P2 | Done | Review trend plus 5-to-1 star counts from Google Maps, used only when they add up to the review count | test/partials.test.ts, test/formula.test.ts |
| QF-026 | Business imagery and profile media | P3 | Built | Image from the business's own site (schema.org logo/image or og:image), shown not stored | typecheck |
| QF-027 | Website technology inventory | P2 | Done | intel.detectTech (34 technologies with markers) | test/intel.test.ts |
| QF-028 | Company size and growth fields | P3 | Built | Size, employee growth per year, founding, revenue from Wikidata (CC0) matched by official website | test/partials.test.ts (claims → facts); live lookup not run here |
| QF-029 | Evidence and source provenance per field | P1 | Built | leads.provenance: listing, website evidence, email pages, checks, conflicts | typecheck |
| QF-030 | Field freshness and stale-data warnings | P1 | Built | settings.freshDays; signals runner re-checks stale leads; "Not checked in 90 days" filter | typecheck |
| QF-031 | Configurable enrichment waterfall | P1 | Built | settings.waterfall order and stop rule; provenance.waterfall trail | typecheck |
| QF-032 | Provider conflict reconciliation | P2 | Built | provenance.conflicts for phone and city; shown in Evidence card | typecheck |
| QF-033 | Explainable ICP fit rules | P1 | Done | intel.scoreLead (relevance and evidence kept apart); Settings → Ideal customer | test/intel.test.ts |
| QF-034 | Industry-specific qualification presets | P1 | Done | intel.PRESETS (7 editable presets) | test/intel.test.ts |
| QF-035 | A/B/C lead quality tiers | P2 | Done | A/B/C/D grade with reasons; Grade column and filter | test/intel.test.ts |
| QF-036 | Business-change watchlists | P2 | Built | watches (0.11) plus "changed" signals from snapshot diffs | test/intel.test.ts (diff) |
| QF-037 | Source snapshots and comparison history | P2 | Built | lead_snapshots + diffSnapshot | test/intel.test.ts |
| QF-038 | Buying-signal confidence controls | P2 | Done | signals.confidence and signals.evidence | test/intel.test.ts |
| QF-039 | Bulk domain-based contact lookup | P2 | Built | verify.hunterDomain; "Find more emails" in the Evidence card | typecheck; needs a Hunter key |
| QF-040 | Verified source URLs for discovered contacts | P1 | Built | enrich.ts emailSources → provenance.emails; shown per email | typecheck |
| QF-041 | Email syntax and domain-level checks as separate statuses | P1 | Done | intel.EMAIL_STATUS, validSyntax; "ok" migrated to "mx-ok" | test/intel.test.ts |
| QF-042 | Optional provider-backed mailbox verification | P2 | Built | verify.ts Hunter and ZeroBounce adapters | typecheck; needs a key |
| QF-043 | Bulk email validation queue | P2 | Built | verify.verifyLeads, 30-day cache (email_checks), daily limits; "Check emails" bulk action | typecheck |
| QF-044 | Role and department contact filters | P2 | Done | Contact role filter (lead role or contacts table) | test/int/records.int.ts |
| QF-045 | Contact freshness and historical changes | P1 | Built | email_checks.at, contacts.confirmed_at, bounces set status | typecheck |
| QF-046 | Contact do-not-solicit enforcement | P0 | Done | safety.ts outreachBlock; outreach.ts, mail.ts | test/safety.test.ts |
| QF-047 | Kanban pipeline view | P1 | Done | crm.saveDeal/moveDeal/deal_history | test/int/data.int.ts |
| QF-048 | Deal and opportunity records | P1 | Done | Deal value, currency check, stage → lead status | test/int/data.int.ts |
| QF-049 | Tasks and reminders | P1 | Done | Tasks, reminders fire once | test/int/records.int.ts |
| QF-050 | Custom fields and field types | P2 | Done | custom_fields + cleanValue (text, number, date, select, url); in exports | test/crm.test.ts |
| QF-051 | Customizable saved views | P2 | Done | Saved views round-trip | test/int/records.int.ts |
| QF-052 | Companies, contacts, locations and deals data model | P1 | Done | Leads ↔ companies ↔ deals; 0.20 table migrated | test/int/data.int.ts |
| QF-053 | Data merge review UI | P2 | Done | mergeLeads/undoMerge with history moved back; cross-client merge refused | test/int/data.int.ts |
| QF-054 | Calendar-based next-action view | P2 | Built | Pipeline → Tasks → Week view (local tasks; no external calendar sync) | preview |
| QF-055 | Opportunity forecasting dashboard | P2 | Done | crm.forecast | test/int/data.int.ts |
| QF-056 | Client/project workspaces | P3 | Done | Client-scoped duplicates, companies, branches, merges | test/int/data.int.ts |
| QF-057 | Role-based collaboration (optional) | P3 | Blocked | Collaboration needs a shared server or sync service; Quarrix is local-first. Not built. | — |
| QF-058 | Fix ordered follow-up state machine | P0 | Done | safety.ts DUE_SQL; db.dueMessages | test/safety.test.ts (SQLite) |
| QF-059 | Gmail browser-based OAuth | P1 | Built | oauth.ts with a separate Google client (ID + secret), loopback + PKCE, XOAUTH2; Sheets reuses the Google client | test/int/hardening.int.ts (client selection, migration); needs the owner's Google OAuth client for a live sign-in |
| QF-060 | Microsoft 365/Outlook OAuth | P1 | Built | oauth.ts with a separate Microsoft app ID and tenant (single-tenant apps), public client (no secret sent) | test/int/hardening.int.ts (client, tenant endpoints); needs an Azure app for a live sign-in |
| QF-061 | Multiple connected sending accounts | P2 | Done | Several mailboxes, least-loaded choice, one mailbox per sequence, own limits, no fallback | test/int/outreach.int.ts (real SMTP) |
| QF-062 | Unified replies inbox | P2 | Built | Replies from every mailbox with a mailbox column | typecheck |
| QF-063 | Reply intent labeling | P2 | Done | rules.classifyReply with reason; ambiguous → review | test/rules.test.ts |
| QF-064 | Visual sequence editor | P1 | Done | Sequence order and per-step due dates in the real send loop | test/int/outreach.int.ts |
| QF-065 | Pre-send dry run | P1 | Done | rules.dryRun + deliverability.dryRunPlan; Outreach → Send plan | test/rules.test.ts |
| QF-066 | Explicit send authorization | P1 | Done | No approval without an approved connected mailbox; address change turns approval off | test/int/outreach.int.ts |
| QF-067 | IANA timezone-aware scheduling | P1 | Done | rules.zoneFor (tz-lookup), localClock, inWindowAt, nextWindow; mail.inWindow | test/rules.test.ts |
| QF-068 | Bounce/complaint circuit breakers | P1 | Done | rules.breaker + mail.recentHealth; auto-pause with reason | test/rules.test.ts |
| QF-069 | Deliverability DNS diagnostics | P2 | Done | rules.explainDns + deliverability.checkDomain | test/rules.test.ts |
| QF-070 | Optional inbox placement testing | P3 | Built | mail-tester.com flow: sends the latest draft to the tester address and opens the score | typecheck; needs live send |
| QF-071 | A/B tests for approved messaging | P2 | Done | Version B on every second lead with custom subject | test/int/outreach.int.ts, test/rules.test.ts |
| QF-072 | Per-mailbox and per-campaign metrics | P2 | Built | Per-mailbox sent, today/limit and replies; A/B reply rates | typecheck |
| QF-073 | Campaign attention center | P1 | Done | Failed sends appear in the attention queue | test/int/records.int.ts |
| QF-074 | Cross-campaign contact exclusion rules | P1 | Done | Same company (any branch) not emailed again within the set days | test/int/records.int.ts |
| QF-075 | Optional transactional email provider adapter | P3 | Built | SendGrid v3 sending as a mailbox type | typecheck; needs a SendGrid key |
| QF-076 | No-code automation builder | P2 | Done | Rules run on real events and act (tag, task) | test/int/api.int.ts |
| QF-077 | Workflow templates | P2 | Done | automation.TEMPLATES (5, off by default) | test/integrations.test.ts |
| QF-078 | Conditional routing | P2 | Done | automation.matches (eq, neq, in, contains, gte, lte, empty, notempty) | test/integrations.test.ts |
| QF-079 | Formula and computed-field engine | P3 | Done | formula.ts (safe parser, no code execution); formula custom fields in drawer and exports | test/formula.test.ts |
| QF-080 | Normalized source plugin SDK | P2 | Done | Declarative JSON sources (sources/sdk.ts), validation, encrypted keys, licence terms (export/contact) enforced, duplicate IDs refused, docs/SOURCE_SDK.md | test/partials.test.ts, test/hardening.test.ts, test/int/hardening.int.ts |
| QF-081 | Local REST API (opt-in) | P2 | Done | Local API over HTTP: token, host check, capture-only token | test/int/api.int.ts |
| QF-082 | Command-line interface | P2 | Done | CLI against the running API | test/int/api.int.ts |
| QF-083 | Optional MCP server | P3 | Done | MCP list_leads against the running API | test/int/api.int.ts |
| QF-084 | Generic webhook actions | P2 | Done | Signed webhook received and verified by a real HTTP server | test/int/api.int.ts |
| QF-085 | HubSpot adapter | P3 | Built | integrations.toHubspot (companies by domain, contacts by email, association) | typecheck; needs a HubSpot token |
| QF-086 | Google Sheets connector | P3 | Built | integrations.toSheets (own Google OAuth client, append rows) | typecheck; needs an OAuth client |
| QF-087 | Notion connector | P3 | Built | integrations.toNotion (property matching by name and type) | typecheck; needs a Notion token |
| QF-088 | n8n/Zapier adapters | P3 | Built | Signed webhooks + setup notes for Zapier, Make and n8n (docs/INTEGRATIONS.md) | typecheck |
| QF-089 | Structured export adapters | P3 | Done | exporters.ts: PostgreSQL upsert; S3-compatible PUT with SigV4 | test/exporters.test.ts (signature equals botocore) |
| QF-090 | Approved-source browser extension | P3 | Built | extension/ (MV3 popup + options, capture-only token); zipped into each release | typecheck; load-unpacked test pending |
| QF-091 | Greenhouse company jobs connector | P1 | Done | ats.ts employerJobs (Greenhouse board API) | test/jobs.test.ts (recorded shape) |
| QF-092 | Lever jobs connector | P1 | Done | ats.ts (Lever postings API, US and EU) | test/jobs.test.ts (recorded shape) |
| QF-093 | Ashby jobs connector | P1 | Built | ats.ts (Ashby posting API) | typecheck; needs live run |
| QF-094 | SmartRecruiters connector | P2 | Built | ats.ts (SmartRecruiters postings API) | typecheck; needs live run |
| QF-095 | Workday careers connector | P2 | Built | ats.ts (Workday public jobs endpoint) | typecheck; needs live run |
| QF-096 | Personio/Pinpoint connectors | P2 | Built | ats.ts (Personio XML, Pinpoint JSON; also Workable, Recruitee) | typecheck; needs live run |
| QF-097 | Hacker News hiring posts | P2 | Built | ats.hnHiring (HN Algolia API, latest thread) | typecheck; needs live run |
| QF-098 | Glassdoor search connector | P2 | Blocked | Glassdoor has no public jobs API; its terms forbid scraping | — |
| QF-099 | ZipRecruiter connector | P2 | Blocked | ZipRecruiter API is partner-only; needs a partner account | — |
| QF-100 | SEEK, JobStreet and JobsDB connectors | P2 | Blocked | SEEK/JobStreet/JobsDB: no public API without partner approval | — |
| QF-101 | Naukri India connector | P2 | Blocked | Naukri: no public API | — |
| QF-102 | Bayt Middle East connector | P2 | Blocked | Bayt: no public API | — |
| QF-103 | BDJobs and HelloWork connectors | P3 | Blocked | BDJobs and HelloWork: no public API | — |
| QF-104 | Applicant tracking system detection | P1 | Done | ats.detectAts (9 systems); Job search → Employers | test/jobs.test.ts |
| QF-105 | Application URL validation | P1 | Done | ats.postingState + jobstore.checkPosting; "Is it still open?" in job details | test/jobs.test.ts |
| QF-106 | Fresh-jobs-since-last-run mode | P1 | Done | First/last seen, New flag | test/int/records.int.ts |
| QF-107 | Scheduled job alerts | P1 | Done | Alerts checked every 5 minutes and at start; schedule kept from the due time; failed runs retried after 15/30/60… minutes; per-board baselines so a board that was down never floods; errors shown | test/int/hardening.int.ts; live check in the release |
| QF-108 | Job application state accuracy | P1 | Done | Jobs.tsx: Apply sets "Opened", never "Applied" | manual |
| QF-109 | Country-specific regional salary normalization | P2 | Done | ats.parseSalary (currency, period, yearly) | test/jobs.test.ts |
| QF-110 | Salary floor and radius filters | P2 | Done | Distance filter using offline GeoNames coordinates (jobsearch.cityPoint) | test/jobs.test.ts |
| QF-111 | Hide recruiters and company preferences | P2 | Done | ats.isRecruiter; hide/prefer companies (settings.jobs); filter | test/jobs.test.ts |
| QF-112 | Job post provenance and age | P1 | Done | Seen dates, repost detection, yearly salary | test/int/records.int.ts |
| QF-113 | Job result exports | P2 | Built | jobstore.exportSaved CSV/JSON/Markdown; buttons in My applications | typecheck |
| QF-114 | Guided first-launch wizard | P1 | Done | Onboarding.tsx (purpose, profile, ideal customer, privacy), skippable | installed-app smoke test (src/main/smoke.ts) on macOS, Windows and Linux in every release |
| QF-115 | One-click offline sample/demo data | P1 | Not done (owner decision) | Conflicts with the owner's "real data only" rule; the browser preview keeps its demo data, the app does not | — |
| QF-116 | Distinct Business and Career workspaces | P1 | Done | Business, Career and Both workspaces; menu filtered | installed-app smoke test (src/main/smoke.ts) on macOS, Windows and Linux in every release |
| QF-117 | Advanced search preview and estimate | P1 | Built | jobs.previewSearch; Find → Preview (0.13.0) | preview |
| QF-118 | Safe export wizard with field mapping | P2 | Done | Export columns, do-not-contact left out by default | test/int/records.int.ts |
| QF-119 | Encrypted database backups and recovery | P1 | Done | Encrypted backup → wrong passphrase refused → restore of data and settings with safety copy | test/int/data.int.ts |
| QF-120 | Per-feature privacy disclosures | P1 | Done | privacy.ts summary per feature; Settings → Privacy | installed-app smoke test (src/main/smoke.ts) on macOS, Windows and Linux in every release |
| QF-121 | App signing and macOS notarization | P1 | Blocked | Per-platform signing (macOS needs Developer ID + notarization account, Windows an OV .pfx); release verifies codesign/spctl/stapler and Authenticode, and writes the signing state into the notes | Blocked on certificates the owner does not have yet (docs/CREDENTIALS.md); unsigned builds are verified as unsigned |
| QF-122 | Accessibility and keyboard support | P2 | Done | Accessible names, ARIA tabs, contrast, skip link, keyboard focus | axe-core audit (0.21) + every-button-named check in the installed-app smoke test (src/main/smoke.ts) on macOS, Windows and Linux in every release |
| QF-123 | Localized interface and regional defaults | P3 | Done | Whole interface in Urdu, Arabic (RTL), Spanish, French and German: 1,158 strings per language, number patterns, lead data untouched; machine translation awaiting native review | test/i18n.test.ts (complete catalogues, placeholders kept); RTL and translation check in the installed-app smoke test (src/main/smoke.ts) on macOS, Windows and Linux in every release |
| QF-124 | Trusted source audit logs and diagnostics | P1 | Done | diagnostics.ts with safety.redact; Settings → Privacy → Save a diagnostics file | test/safety.test.ts (redaction) |

## Totals

- Done: 76
- Built: 39
- Blocked: 8
- Partial: 0
- Not done: 1

## Security and sending fixes (0.20.0)

| Fix | Where | Verified by |
|---|---|---|
| Hidden browser sessions and the main window cancel requests to local or private addresses, including after redirects; permissions denied; pop-ups blocked | guard.ts | test/safety.test.ts (address rules); runtime check in the app |
| Main window sandboxed; IPC limited to the app's page and 5 MB; message updates limited to known columns | index.ts, db.updateMessage | typecheck |
| Bookmarklet and extension use a capture-only token, rate-limited to 30 a minute | localapi.ts | typecheck |
| Report emails need sending approval and pass the do-not-contact checks | mail.sendReport | typecheck |
| WhatsApp: never to do-not-contact leads; Cloud API needs approval and the lead's recorded opt-in | index.ts waGuard | typecheck |
| Campaign daily limits apply when sending, not only when drafting | mail.campaignFull | typecheck |
| Websites that fail to load are retried after 6 and 12 hours | jobs.runEnrichment | SQL checked with node:sqlite |
| Results clearly outside the searched place are dropped | geo.insideBox | test/safety.test.ts |
| Jobs with the same title and employer in different cities are kept apart | jobsearch.dedupe | test/safety.test.ts |
| Restore brings back settings as well as data | backup.ts | typecheck |
| Command line and MCP work in the installed app without Node.js | cli.ts, electron-builder.yml | typecheck |

## Hardening items (from the backlog's "requires improvement" list)

| # | Item | Status | Where | Verified by |
|---|---|---|---|---|
| 1 | Follow-up order, NULL due dates | Done | safety.ts `DUE_SQL` | test/safety.test.ts |
| 2 | SSRF: private IPs, DNS check, checked redirects, 3 MB cap | Done | util.ts `fetchText`, `assertPublicUrl`; gmaps.ts `openPage` | test/safety.test.ts |
| 3 | Domain-only merges of chain branches | Done | safety.ts `sameBusiness`; db.ts `findDuplicate` | test/safety.test.ts |
| 4 | MX shown as "ok" | Done | intel.ts statuses, verify.ts, migration | test/intel.test.ts |
| 5 | Time zones from longitude | Done | rules.ts zoneFor / inWindowAt | test/rules.test.ts |
| 6 | noSolicit must block outreach | Done | safety.ts `outreachBlock` | test/safety.test.ts |
| 7 | Report captcha / broken selectors | Done (health checks, captcha and bot-check errors) | gmaps.ts throws captcha and bot-check errors | — |
| 8 | Plain-text secret fallback | Done | settings.ts: session-only, never written; warning in Settings | manual |
| 9 | Apply marked Applied | Done | Jobs.tsx | manual |
| 10 | IPC sender check, external URL allow-list, blocked navigation | Done | index.ts | test/safety.test.ts (URL rules) |
| 11 | Regression tests | Done for new logic | 7 test files, 44 tests; CI and the release workflow both run typecheck and tests | CI |
| 12 | Theme forced light | Kept on purpose | the owner asked for light only | — |
