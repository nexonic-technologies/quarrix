# Quarrix backlog status (QF-001 to QF-124)

**v2.3–v2.7 combined candidate:** official Norway and France registration lookups, NYC external postings, evidence coverage and recorded field agreement, refreshed offline CV matching, bounded public-source cache and accessible quality visualization. Existing external access and signing blockers unchanged. Live verification and installer gates pending.

Automated access to LinkedIn, Indeed, Google Jobs and Rozee is withdrawn in v2.2.0; manual links remain. No claim of new partner access.

**v2.2.0 candidate — Free-First Intelligence:** optional keyed discovery, verification and remote writing are paused by default (also on upgrade), without deleting saved credentials. Explicit enablement and positive daily ceilings protect against unintended metered requests. Backup writing providers require a separate opt-in. Existing mail and configured connections retain their independent authorization; provider charges are not guaranteed by Quarrix. Release verification pending; 17 external blockers unchanged.

**v2.1.0 candidate:** accessible onboarding progress and modal isolation, evidence review and scoped duplicate counts, responsive discovery styling, on-demand provider reachability with bounded concurrency and caching. No new external access claims; the 17 external blockers remain. Installer verification is pending the release gate.

**v2.0.1 released:** bounded Overpass resilience, 162/162 installer checks and 23/24 live sources; one temporary Overpass outage remains. Commercial code signing remains credential-blocked. [Release](https://github.com/nexonic-technologies/quarrix/releases/tag/v2.0.1).

**v2.0.0 released:** consolidated v1.2–v1.5 functionality plus lazy-loaded discovery, localization and accessibility regressions. Regional directories are source links, not new scraping connectors. [Release verification](https://github.com/nexonic-technologies/quarrix/releases/tag/v2.0.0) confirms 162/162 installed-app checks and 23/24 live sources, including SEC/BLS; one temporary Overpass outage and zero provider failures. Existing external blockers unchanged.

**v1.1.0 released:** simplified discovery entry points, evidence and freshness warnings, on-demand public GLEIF legal-entity candidate lookup, scoped local recommendations and advertised-salary comparisons. CI passed; [release verification](https://github.com/nexonic-technologies/quarrix/releases/tag/v1.1.0) confirms 156/156 installed-app checks, 21/22 live sources including GLEIF, one temporary outage and zero failures. Existing external blockers unchanged.

**v0.31.0 and v0.32.0 released together in v1.0.0:** proposal and client reporting studio; official public-opportunity directory, recent EU contract notices and local watchlist. Main CI and release checks passed; all six installed-app runs passed 23/23 checks (138/138 total). Live providers: 20/21 returned real data, one temporary Overpass outage, zero failures. See [release verification](https://github.com/nexonic-technologies/quarrix/releases/tag/v1.0.0). Existing external blockers remain unchanged.

**v0.30.0 released:** Market Intelligence reports group stored records by category, country, city, source or linked company and show coverage, check recency, recorded fit and won records. Workspace isolation and aggregate CSV export are covered by tests; CI passed and all six installer configurations passed 21/21 checks. See [release verification](https://github.com/nexonic-technologies/quarrix/releases/tag/v0.30.0).

**v0.29.0 released:** local resume review, contextual interview practice, per-application document drafts and a due-date planner. CI passed; all six installed-app runs passed 20/20 checks. See [release verification](https://github.com/nexonic-technologies/quarrix/releases/tag/v0.29.0).

**v0.28.0 released:** Job Trust Score, contextual warning excerpts and employer-page exact-vacancy corroboration. Unknown provider responses remain unknown. CI passed and all six installed-app runs passed 19/19 checks. See [release verification](https://github.com/nexonic-technologies/quarrix/releases/tag/v0.28.0).

**v0.27.0 Career Intelligence released:** offline occupation exploration using a real, versioned catalog; manual or CV-based profile inputs; explained title/skill matches, related skill suggestions and direct job search. CI passed; all six installed-app runs passed 18/18 checks. See [release verification](https://github.com/nexonic-technologies/quarrix/releases/tag/v0.27.0).

**v0.26.1 released:** Send accounting, proof-report attribution, merge conflict protection, duplicate grouping and release-report integrity passed [CI](https://github.com/nexonic-technologies/quarrix/actions/runs/44927836513) and all six installed-app smoke runs. Live provider results: 19/20 returned data, one temporary Overpass outage, no provider failures. See [release verification](https://github.com/nexonic-technologies/quarrix/releases/tag/v0.26.1). The 17 external blockers remain unchanged.

Source: Quarrix_Missing_Features_Backlog.md. **Done** = built and covered by an automated test (unit tests in Node; integration tests in test/int run in Electron's own Node against real SQLite, real SMTP servers, a real HTTP API, and the real CLI and MCP processes). **Built** = implemented and type-checked, but only checked by hand or in the browser preview; it still needs a live run in the app. **Partial** = some of the item exists, not end to end. **Blocked** = cannot be done with authorised access today (reason given).

| ID | Feature | Pri | Status | Where | Verified by |
|---|---|---|---|---|---|
| QF-001 | Persisted pause/resume checkpoints | P1 | Done | Interrupted searches go back in the queue at start-up (checkpoint per source and area) | test/int/records.int.ts |
| QF-002 | Batch search builder | P1 | Done | jobs.queueBatch, search_templates table, FindTools BatchModal | test/int/verify.int.ts (real SQLite and app code; outside services answered by recorded HTTP) |
| QF-003 | Interactive radius and polygon search | P2 | Done | Circle or drawn polygon (FindTools MapPicker); geo.inPolygon/polygonCircle; grid limited to the polygon | test/safety.test.ts (polygon) |
| QF-004 | Geographic grid coverage | P2 | Done | geo.ts gridCells/zoomFor; Google Maps grid in jobs.ts | test/discovery.test.ts |
| QF-005 | Overture Maps connector | P1 | Done | sources/overture.ts: every listing page (continuation tokens), every file footer read so no region is skipped, antimeridian boxes split, plural/category matching, read limit reported as partial, budgets and private-address checks on range reads | live provider check in the v0.22.1 release (live-providers.json): 10 places in Austin from the live Overture release |
| QF-006 | Socrata open-data adapter | P2 | Done | sources/opendata.ts searchSocrata; Settings → Sources feeds | test/discovery.test.ts (recorded shape) |
| QF-007 | ArcGIS public-layer adapter | P2 | Done | sources/opendata.ts searchArcgis | test/discovery.test.ts (recorded shape) |
| QF-008 | US NPI healthcare registry adapter | P2 | Done | sources/opendata.ts searchNpi (NPI-1/NPI-2) | test/discovery.test.ts (recorded shape) |
| QF-009 | Wikidata business source | P3 | Done | sources/opendata.ts searchWikidata (SPARQL) | live provider check in the v0.22.0 release (live-providers.json: real data from the public service): 8 hospitals in London |
| QF-010 | Source capability catalog | P1 | Done | sources/catalog.ts; SourcesPanel | test/discovery.test.ts |
| QF-011 | Provider connectivity diagnostics | P1 | Done | health.ts checkSources; SourcesPanel "Check all sources" | typecheck; needs live run; live-verified in v0.23.0 release |
| QF-012 | Per-provider request budgets | P1 | Done | budget.ts (host-based counting), provider_usage table, limits in Settings | test/int/verify.int.ts (real SQLite and app code; outside services answered by recorded HTTP) |
| QF-013 | Batch preflight/small-sample preview | P1 | Done | jobs.previewSearch; FindTools PreviewModal | preview UI; live-verified in v0.23.0 release |
| QF-014 | Separated browser navigation workers | P0 | Done | sources/gmaps.ts pageHtml (own window, own session, own queue) | manual (Electron) |
| QF-015 | Business search map with clustering | P2 | Done | FindTools LeadMap (Leaflet + markercluster), Leads → Map | installed-app smoke test on macOS, Windows and Linux (map with clustering drawn) |
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
| QF-026 | Business imagery and profile media | P3 | Done | Image from the business's own site (schema.org logo/image or og:image), shown not stored | test/int/verify.int.ts (real SQLite and app code; outside services answered by recorded HTTP) |
| QF-027 | Website technology inventory | P2 | Done | intel.detectTech (34 technologies with markers) | test/intel.test.ts |
| QF-028 | Company size and growth fields | P3 | Done | Size, employee growth per year, founding, revenue from Wikidata (CC0) matched by official website | live provider check in the v0.22.0 release (live-providers.json: real data from the public service): Stripe: 8,000 employees, founded 2010 |
| QF-029 | Evidence and source provenance per field | P1 | Done | leads.provenance: listing, website evidence, email pages, checks, conflicts | test/int/verify.int.ts (real SQLite and app code; outside services answered by recorded HTTP) |
| QF-030 | Field freshness and stale-data warnings | P1 | Done | settings.freshDays; signals runner re-checks stale leads; "Not checked in 90 days" filter | test/int/verify.int.ts (real SQLite and app code; outside services answered by recorded HTTP) |
| QF-031 | Configurable enrichment waterfall | P1 | Done | settings.waterfall order and stop rule; provenance.waterfall trail | test/int/verify.int.ts (real SQLite and app code; outside services answered by recorded HTTP) |
| QF-032 | Provider conflict reconciliation | P2 | Done | provenance.conflicts for phone and city; shown in Evidence card | test/int/verify.int.ts (real SQLite and app code; outside services answered by recorded HTTP) |
| QF-033 | Explainable ICP fit rules | P1 | Done | intel.scoreLead (relevance and evidence kept apart); Settings → Ideal customer | test/intel.test.ts |
| QF-034 | Industry-specific qualification presets | P1 | Done | intel.PRESETS (7 editable presets) | test/intel.test.ts |
| QF-035 | A/B/C lead quality tiers | P2 | Done | A/B/C/D grade with reasons; Grade column and filter | test/intel.test.ts |
| QF-036 | Business-change watchlists | P2 | Done | watches (0.11) plus "changed" signals from snapshot diffs | test/intel.test.ts (snapshot diffs) and watch searches in test/int |
| QF-037 | Source snapshots and comparison history | P2 | Done | lead_snapshots + diffSnapshot | test/intel.test.ts |
| QF-038 | Buying-signal confidence controls | P2 | Done | signals.confidence and signals.evidence | test/intel.test.ts |
| QF-039 | Bulk domain-based contact lookup | P2 | Blocked | verify.hunterDomain; "Find more emails" in the Evidence card | test/int/verify.int.ts and test/int/hardening.int.ts against recorded API answers. Live check blocked: needs the owner's Hunter key |
| QF-040 | Verified source URLs for discovered contacts | P1 | Done | enrich.ts emailSources → provenance.emails; shown per email | test/int/verify.int.ts (real SQLite and app code; outside services answered by recorded HTTP) |
| QF-041 | Email syntax and domain-level checks as separate statuses | P1 | Done | intel.EMAIL_STATUS, validSyntax; "ok" migrated to "mx-ok" | test/intel.test.ts |
| QF-042 | Optional provider-backed mailbox verification | P2 | Blocked | verify.ts Hunter and ZeroBounce adapters | test/int/verify.int.ts and test/int/hardening.int.ts against recorded API answers. Live check blocked: needs the owner's Hunter or ZeroBounce key |
| QF-043 | Bulk email validation queue | P2 | Done | verify.verifyLeads, 30-day cache (email_checks), daily limits; "Check emails" bulk action | test/int/verify.int.ts (real SQLite and app code; outside services answered by recorded HTTP) |
| QF-044 | Role and department contact filters | P2 | Done | Contact role filter (lead role or contacts table) | test/int/records.int.ts |
| QF-045 | Contact freshness and historical changes | P1 | Done | email_checks.at, contacts.confirmed_at, bounces set status | test/int/verify.int.ts (real SQLite and app code; outside services answered by recorded HTTP) |
| QF-046 | Contact do-not-solicit enforcement | P0 | Done | safety.ts outreachBlock; outreach.ts, mail.ts | test/safety.test.ts |
| QF-047 | Kanban pipeline view | P1 | Done | crm.saveDeal/moveDeal/deal_history | test/int/data.int.ts |
| QF-048 | Deal and opportunity records | P1 | Done | Deal value, currency check, stage → lead status | test/int/data.int.ts |
| QF-049 | Tasks and reminders | P1 | Done | Tasks, reminders fire once | test/int/records.int.ts |
| QF-050 | Custom fields and field types | P2 | Done | custom_fields + cleanValue (text, number, date, select, url); in exports | test/crm.test.ts |
| QF-051 | Customizable saved views | P2 | Done | Saved views round-trip | test/int/records.int.ts |
| QF-052 | Companies, contacts, locations and deals data model | P1 | Done | Leads ↔ companies ↔ deals; 0.20 table migrated | test/int/data.int.ts |
| QF-053 | Data merge review UI | P2 | Done | mergeLeads/undoMerge with history moved back; cross-client merge refused | test/int/data.int.ts |
| QF-054 | Calendar-based next-action view | P2 | Done | Pipeline → Tasks → Week view (local tasks; no external calendar sync) | test/int/verify.int.ts (real SQLite and app code; outside services answered by recorded HTTP); installed-app smoke test (week view) |
| QF-055 | Opportunity forecasting dashboard | P2 | Done | crm.forecast | test/int/data.int.ts |
| QF-056 | Client/project workspaces | P3 | Done | Client-scoped duplicates, companies, branches, merges | test/int/data.int.ts |
| QF-057 | Role-based collaboration (optional) | P3 | Blocked | Collaboration needs a shared server or sync service; Quarrix is local-first. Not built. | — |
| QF-058 | Fix ordered follow-up state machine | P0 | Done | safety.ts DUE_SQL; db.dueMessages | test/safety.test.ts (SQLite) |
| QF-059 | Gmail browser-based OAuth | P1 | Blocked | oauth.ts with a separate Google client (ID + secret), loopback + PKCE, XOAUTH2; Sheets reuses the Google client | test/int/verify.int.ts and test/int/hardening.int.ts against recorded API answers. Live check blocked: needs the owner's Google OAuth client and account |
| QF-060 | Microsoft 365/Outlook OAuth | P1 | Blocked | oauth.ts with a separate Microsoft app ID and tenant (single-tenant apps), public client (no secret sent) | test/int/verify.int.ts and test/int/hardening.int.ts against recorded API answers. Live check blocked: needs the owner's Azure app and Microsoft 365 account |
| QF-061 | Multiple connected sending accounts | P2 | Done | Several mailboxes, least-loaded choice, one mailbox per sequence, own limits, no fallback | test/int/outreach.int.ts (real SMTP) |
| QF-062 | Unified replies inbox | P2 | Done | Replies from every mailbox with a mailbox column | test/int/verify.int.ts (real SQLite and app code; outside services answered by recorded HTTP) |
| QF-063 | Reply intent labeling | P2 | Done | rules.classifyReply with reason; ambiguous → review | test/rules.test.ts |
| QF-064 | Visual sequence editor | P1 | Done | Sequence order and per-step due dates in the real send loop | test/int/outreach.int.ts |
| QF-065 | Pre-send dry run | P1 | Done | rules.dryRun + deliverability.dryRunPlan; Outreach → Send plan | test/rules.test.ts |
| QF-066 | Explicit send authorization | P1 | Done | No approval without an approved connected mailbox; address change turns approval off | test/int/outreach.int.ts |
| QF-067 | IANA timezone-aware scheduling | P1 | Done | rules.zoneFor (tz-lookup), localClock, inWindowAt, nextWindow; mail.inWindow | test/rules.test.ts |
| QF-068 | Bounce/complaint circuit breakers | P1 | Done | rules.breaker + mail.recentHealth; auto-pause with reason | test/rules.test.ts |
| QF-069 | Deliverability DNS diagnostics | P2 | Done | rules.explainDns + deliverability.checkDomain | test/rules.test.ts |
| QF-070 | Optional inbox placement testing | P3 | Blocked | mail-tester.com flow: sends the latest draft to the tester address and opens the score | code review; placement counts towards limits in test/int/hardening.int.ts. Live check blocked: needs the owner's a real mailbox and a mail-tester.com run |
| QF-071 | A/B tests for approved messaging | P2 | Done | Version B on every second lead with custom subject | test/int/outreach.int.ts, test/rules.test.ts |
| QF-072 | Per-mailbox and per-campaign metrics | P2 | Done | Per-mailbox sent, today/limit and replies; A/B reply rates | test/int/verify.int.ts (real SQLite and app code; outside services answered by recorded HTTP) |
| QF-073 | Campaign attention center | P1 | Done | Failed sends appear in the attention queue | test/int/records.int.ts |
| QF-074 | Cross-campaign contact exclusion rules | P1 | Done | Same company (any branch) not emailed again within the set days | test/int/records.int.ts |
| QF-075 | Optional transactional email provider adapter | P3 | Blocked | SendGrid v3 sending as a mailbox type | test/int/verify.int.ts and test/int/hardening.int.ts against recorded API answers. Live check blocked: needs the owner's SendGrid key and verified sender |
| QF-076 | No-code automation builder | P2 | Done | Rules run on real events and act (tag, task) | test/int/api.int.ts |
| QF-077 | Workflow templates | P2 | Done | automation.TEMPLATES (5, off by default) | test/integrations.test.ts |
| QF-078 | Conditional routing | P2 | Done | automation.matches (eq, neq, in, contains, gte, lte, empty, notempty) | test/integrations.test.ts |
| QF-079 | Formula and computed-field engine | P3 | Done | formula.ts (safe parser, no code execution); formula custom fields in drawer and exports | test/formula.test.ts |
| QF-080 | Normalized source plugin SDK | P2 | Done | Declarative JSON sources (sources/sdk.ts), validation, encrypted keys, licence terms (export/contact) enforced, duplicate IDs refused, docs/SOURCE_SDK.md | test/partials.test.ts, test/hardening.test.ts, test/int/hardening.int.ts |
| QF-081 | Local REST API (opt-in) | P2 | Done | Local API over HTTP: token, host check, capture-only token | test/int/api.int.ts |
| QF-082 | Command-line interface | P2 | Done | CLI against the running API | test/int/api.int.ts |
| QF-083 | Optional MCP server | P3 | Done | MCP list_leads against the running API | test/int/api.int.ts |
| QF-084 | Generic webhook actions | P2 | Done | Signed webhook received and verified by a real HTTP server | test/int/api.int.ts |
| QF-085 | HubSpot adapter | P3 | Blocked | integrations.toHubspot (companies by domain, contacts by email, association) | test/int/verify.int.ts and test/int/hardening.int.ts against recorded API answers. Live check blocked: needs the owner's HubSpot private app token |
| QF-086 | Google Sheets connector | P3 | Blocked | integrations.toSheets (own Google OAuth client, append rows) | test/int/verify.int.ts and test/int/hardening.int.ts against recorded API answers. Live check blocked: needs the owner's Google OAuth client with Sheets |
| QF-087 | Notion connector | P3 | Blocked | integrations.toNotion (property matching by name and type) | test/int/verify.int.ts and test/int/hardening.int.ts against recorded API answers. Live check blocked: needs the owner's Notion integration token |
| QF-088 | n8n/Zapier adapters | P3 | Done | Signed webhooks + setup notes for Zapier, Make and n8n (docs/INTEGRATIONS.md) | test/int/api.int.ts (signed webhooks to a real HTTP server, retries) |
| QF-089 | Structured export adapters | P3 | Done | exporters.ts: PostgreSQL upsert; S3-compatible PUT with SigV4 | test/exporters.test.ts (signature equals botocore) |
| QF-090 | Approved-source browser extension | P3 | Done | extension/ (MV3 popup + options, capture-only token); zipped into each release | test/int/verify.int.ts (real SQLite and app code; outside services answered by recorded HTTP); capture endpoint in test/int/api.int.ts |
| QF-091 | Greenhouse company jobs connector | P1 | Done | ats.ts employerJobs (Greenhouse board API) | test/jobs.test.ts (recorded shape) |
| QF-092 | Lever jobs connector | P1 | Done | ats.ts (Lever postings API, US and EU) | test/jobs.test.ts (recorded shape) |
| QF-093 | Ashby jobs connector | P1 | Done | ats.ts (Ashby posting API) | live provider check in the v0.22.1 release (live-providers.json): 187 Ashby jobs (Ramp) |
| QF-094 | SmartRecruiters connector | P2 | Done | ats.ts (SmartRecruiters postings API) | typecheck; needs live run; live-verified in v0.23.0 release |
| QF-095 | Workday careers connector | P2 | Done | ats.ts (Workday public jobs endpoint) | live provider check in the v0.22.0 release (live-providers.json: real data from the public service): 400 NVIDIA Workday jobs |
| QF-096 | Personio/Pinpoint connectors | P2 | Done | ats.ts (Personio XML, Pinpoint JSON; also Workable, Recruitee) | typecheck; needs live run; live checks added against personio.jobs.personio.de and workwithus.pinpointhq.com (v0.25.0); live-verified in v0.25.0 release |
| QF-097 | Hacker News hiring posts | P2 | Done | ats.hnHiring (HN Algolia API, latest thread) | live provider check in the v0.22.0 release (live-providers.json: real data from the public service): 48 posts from the latest thread |
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
| QF-113 | Job result exports | P2 | Done | jobstore.exportSaved CSV/JSON/Markdown; buttons in My applications | test/int/verify.int.ts (real SQLite and app code; outside services answered by recorded HTTP) |
| QF-114 | Guided first-launch wizard | P1 | Done | Onboarding.tsx (purpose, profile, ideal customer, privacy), skippable | installed-app smoke test (src/main/smoke.ts) on macOS, Windows and Linux in every release |
| QF-115 | One-click offline sample/demo data | P1 | Not done (owner decision) | Conflicts with the owner's "real data only" rule; the browser preview keeps its demo data, the app does not | — |
| QF-116 | Distinct Business and Career workspaces | P1 | Done | Business, Career and Both workspaces; menu filtered | installed-app smoke test (src/main/smoke.ts) on macOS, Windows and Linux in every release |
| QF-117 | Advanced search preview and estimate | P1 | Done | jobs.previewSearch; Find → Preview (0.13.0) | preview; live-verified in v0.23.0 release |
| QF-118 | Safe export wizard with field mapping | P2 | Done | Export columns, do-not-contact left out by default | test/int/records.int.ts |
| QF-119 | Encrypted database backups and recovery | P1 | Done | Encrypted backup → wrong passphrase refused → restore of data and settings with safety copy | test/int/data.int.ts |
| QF-120 | Per-feature privacy disclosures | P1 | Done | privacy.ts summary per feature; Settings → Privacy | installed-app smoke test (src/main/smoke.ts) on macOS, Windows and Linux in every release |
| QF-121 | App signing and macOS notarization | P1 | Blocked | Per-platform signing (macOS needs Developer ID + notarization account, Windows an OV .pfx); release verifies codesign/spctl/stapler and Authenticode, and writes the signing state into the notes | Blocked on certificates the owner does not have yet (docs/CREDENTIALS.md); unsigned builds are verified as unsigned |
| QF-122 | Accessibility and keyboard support | P2 | Done | Accessible names, ARIA tabs, contrast, skip link, keyboard focus | axe-core audit (0.21) + every-button-named check in the installed-app smoke test (src/main/smoke.ts) on macOS, Windows and Linux in every release |
| QF-123 | Localized interface and regional defaults | P3 | Done | Whole interface in Urdu, Arabic (RTL), Spanish, French and German: 1,158 strings per language, number patterns, lead data untouched; machine translation awaiting native review | test/i18n.test.ts (complete catalogues, placeholders kept); RTL and translation check in the installed-app smoke test (src/main/smoke.ts) on macOS, Windows and Linux in every release |
| QF-124 | Trusted source audit logs and diagnostics | P1 | Done | diagnostics.ts with safety.redact; Settings → Privacy → Save a diagnostics file | test/safety.test.ts (redaction) |

## Totals

- Done: 106
- Built: 0
- Blocked: 17
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
