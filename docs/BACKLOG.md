# Quarrix backlog status (QF-001 to QF-124)

Source: Quarrix_Missing_Features_Backlog.md. **Done** = built and covered by an automated test. **Built** = implemented and type-checked, but only checked by hand or in the browser preview; it still needs a live run in the app. **Partial** = some of the item exists, not end to end. **Blocked** = cannot be done with authorised access today (reason given).

| ID | Feature | Pri | Status | Where | Verified by |
|---|---|---|---|---|---|
| QF-001 | Persisted pause/resume checkpoints | P1 | Built | jobs.ts checkpoints (searches.checkpoint), requeueInterrupted, pause/resume | typecheck; needs live run |
| QF-002 | Batch search builder | P1 | Built | jobs.queueBatch, search_templates table, FindTools BatchModal | preview UI |
| QF-003 | Interactive radius and polygon search | P2 | Done | Circle or drawn polygon (FindTools MapPicker); geo.inPolygon/polygonCircle; grid limited to the polygon | test/safety.test.ts (polygon) |
| QF-004 | Geographic grid coverage | P2 | Done | geo.ts gridCells/zoomFor; Google Maps grid in jobs.ts | test/discovery.test.ts |
| QF-005 | Overture Maps connector | P1 | Partial | Overture GeoJSON import; no live query (Overture publishes files only, no query API) | test/discovery.test.ts |
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
| QF-017 | Contact-source permissions registry | P1 | Built | catalog export/contact/attribution; export skips no-export sources and adds "Data credit" | test/discovery.test.ts (flags) |
| QF-018 | Company-versus-branch hierarchy | P1 | Built | companies table, linkCompany, Leads → Companies with locations, contacts and open deals | typecheck, preview |
| QF-019 | Multi-contact relationships | P1 | Built | contacts table; website, Hunter and manual contacts in the Evidence card | typecheck |
| QF-020 | Operating-hours data | P2 | Done | Hours from OSM opening_hours, Google Maps and schema.org (intel.osmDetails/schemaDetails) | test/formula.test.ts |
| QF-021 | Business open/closed status tracking | P2 | Done | Status operational / temporarily / permanently closed (OSM, Google Maps) | test/formula.test.ts |
| QF-022 | Price tier and amenities fields | P3 | Done | Price level, amenities, payment methods with source label | test/formula.test.ts |
| QF-023 | Booking, ordering and menu links | P2 | Done | intel.actionLinks → leads.details.links | test/intel.test.ts |
| QF-024 | Place listing IDs and canonical URLs | P1 | Done | intel.listingUrl; Evidence card "open" | test/intel.test.ts |
| QF-025 | Review distribution and trends | P2 | Done | intel.reviewTrend (reviews per month, rating change) in the Evidence card | test/formula.test.ts |
| QF-026 | Business imagery and profile media | P3 | Built | Image from the business's own site (schema.org logo/image or og:image), shown not stored | typecheck |
| QF-027 | Website technology inventory | P2 | Done | intel.detectTech (34 technologies with markers) | test/intel.test.ts |
| QF-028 | Company size and growth fields | P3 | Partial | Founding year and employee count from the business's own website; licensed firmographic APIs not added | test/formula.test.ts |
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
| QF-044 | Role and department contact filters | P2 | Built | "Contact role" filter (contact_role and contacts.role) | typecheck |
| QF-045 | Contact freshness and historical changes | P1 | Built | email_checks.at, contacts.confirmed_at, bounces set status | typecheck |
| QF-046 | Contact do-not-solicit enforcement | P0 | Done | safety.ts outreachBlock; outreach.ts, mail.ts | test/safety.test.ts |
| QF-047 | Kanban pipeline view | P1 | Built | crm.ts deals + moveDeal + deal_history; Pipeline board (drag and drop, arrow buttons) | typecheck, preview |
| QF-048 | Deal and opportunity records | P1 | Built | deals table: value, currency, probability, products, expected close, lost reason | typecheck |
| QF-049 | Tasks and reminders | P1 | Built | tasks table, reminders (Notification every minute), Pipeline → Tasks, tasks on each lead | typecheck |
| QF-050 | Custom fields and field types | P2 | Done | custom_fields + cleanValue (text, number, date, select, url); in exports | test/crm.test.ts |
| QF-051 | Customizable saved views | P2 | Built | saved_views; Leads "Save view" chips | typecheck |
| QF-052 | Companies, contacts, locations and deals data model | P1 | Built | Companies ↔ locations (leads) ↔ contacts ↔ deals; legacy leads linked at start-up | typecheck |
| QF-053 | Data merge review UI | P2 | Built | crm.duplicateGroups / mergeLeads / undoMerge / keepApart; Leads → Duplicates | typecheck; needs live data |
| QF-054 | Calendar-based next-action view | P2 | Built | Pipeline → Tasks → Week view (local tasks; no external calendar sync) | preview |
| QF-055 | Opportunity forecasting dashboard | P2 | Built | crm.forecast: open, weighted, won, win rate, by stage and month, lost reasons | typecheck |
| QF-056 | Client/project workspaces | P3 | Built | leads.client, client picker on Leads; new search results filed under the current client; API and exports follow it | typecheck |
| QF-057 | Role-based collaboration (optional) | P3 | Blocked | Collaboration needs a shared server or sync service; Quarrix is local-first. Not built. | — |
| QF-058 | Fix ordered follow-up state machine | P0 | Done | safety.ts DUE_SQL; db.dueMessages | test/safety.test.ts (SQLite) |
| QF-059 | Gmail browser-based OAuth | P1 | Built | oauth.ts (Google, loopback + PKCE, user's own client), XOAUTH2 in mail.ts | typecheck; needs the owner's OAuth client to test |
| QF-060 | Microsoft 365/Outlook OAuth | P1 | Built | oauth.ts (Microsoft 365 SMTP.Send + IMAP) | typecheck; needs an Azure app to test |
| QF-061 | Multiple connected sending accounts | P2 | Built | mailboxes.ts: extra mailboxes (SMTP, Google, Microsoft, SendGrid), own approval, warm-up, limits; sequence pinned to one mailbox; unified reply inbox | typecheck; needs real mailboxes |
| QF-062 | Unified replies inbox | P2 | Built | Replies from every mailbox with a mailbox column | typecheck |
| QF-063 | Reply intent labeling | P2 | Done | rules.classifyReply with reason; ambiguous → review | test/rules.test.ts |
| QF-064 | Visual sequence editor | P1 | Built | Sequence editor in Settings → Email (global steps; not per campaign yet) | typecheck |
| QF-065 | Pre-send dry run | P1 | Done | rules.dryRun + deliverability.dryRunPlan; Outreach → Send plan | test/rules.test.ts |
| QF-066 | Explicit send authorization | P1 | Built | email.authorizedAt/authorizedFrom; sending off until approved; UI cannot set it | typecheck |
| QF-067 | IANA timezone-aware scheduling | P1 | Done | rules.zoneFor (tz-lookup), localClock, inWindowAt, nextWindow; mail.inWindow | test/rules.test.ts |
| QF-068 | Bounce/complaint circuit breakers | P1 | Done | rules.breaker + mail.recentHealth; auto-pause with reason | test/rules.test.ts |
| QF-069 | Deliverability DNS diagnostics | P2 | Done | rules.explainDns + deliverability.checkDomain | test/rules.test.ts |
| QF-070 | Optional inbox placement testing | P3 | Built | mail-tester.com flow: sends the latest draft to the tester address and opens the score | typecheck; needs live send |
| QF-071 | A/B tests for approved messaging | P2 | Done | Version B subject per second lead, rules.abResult (z-test, 30 per side) | test/rules.test.ts |
| QF-072 | Per-mailbox and per-campaign metrics | P2 | Built | Per-mailbox sent, today/limit and replies; A/B reply rates | typecheck |
| QF-073 | Campaign attention center | P1 | Built | db.attention; Outreach → Needs attention | typecheck |
| QF-074 | Cross-campaign contact exclusion rules | P1 | Built | mail.contactedRecently (same email or domain, any campaign) | typecheck |
| QF-075 | Optional transactional email provider adapter | P3 | Built | SendGrid v3 sending as a mailbox type | typecheck; needs a SendGrid key |
| QF-076 | No-code automation builder | P2 | Built | automation.ts rules (trigger → conditions → actions); Settings → Automations editor | test/integrations.test.ts (conditions) |
| QF-077 | Workflow templates | P2 | Done | automation.TEMPLATES (5, off by default) | test/integrations.test.ts |
| QF-078 | Conditional routing | P2 | Done | automation.matches (eq, neq, in, contains, gte, lte, empty, notempty) | test/integrations.test.ts |
| QF-079 | Formula and computed-field engine | P3 | Done | formula.ts (safe parser, no code execution); formula custom fields in drawer and exports | test/formula.test.ts |
| QF-080 | Normalized source plugin SDK | P2 | Partial | Declarative Socrata/ArcGIS feeds only; no code plugins (avoids running third-party code) | — |
| QF-081 | Local REST API (opt-in) | P2 | Built | localapi.ts (127.0.0.1, bearer token, host check); docs/INTEGRATIONS.md | typecheck; needs live run |
| QF-082 | Command-line interface | P2 | Done | bin/quarrix.mjs | test/integrations.test.ts (help, no-app error) |
| QF-083 | Optional MCP server | P3 | Done | bin/quarrix-mcp.mjs (stdio JSON-RPC, read tools, confirm-gated search) | test/integrations.test.ts (protocol) |
| QF-084 | Generic webhook actions | P2 | Done | automation.deliver: HMAC-SHA256 signature, 3 retries, delivery log | test/integrations.test.ts (signature) |
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
| QF-106 | Fresh-jobs-since-last-run mode | P1 | Built | job_seen first/last seen; "Only new since last search" filter; New badge | typecheck |
| QF-107 | Scheduled job alerts | P1 | Built | job_alerts + job_alert_hits; runs every 15 min while open; notifications | typecheck |
| QF-108 | Job application state accuracy | P1 | Done | Jobs.tsx: Apply sets "Opened", never "Applied" | manual |
| QF-109 | Country-specific regional salary normalization | P2 | Done | ats.parseSalary (currency, period, yearly) | test/jobs.test.ts |
| QF-110 | Salary floor and radius filters | P2 | Done | Distance filter using offline GeoNames coordinates (jobsearch.cityPoint) | test/jobs.test.ts |
| QF-111 | Hide recruiters and company preferences | P2 | Done | ats.isRecruiter; hide/prefer companies (settings.jobs); filter | test/jobs.test.ts |
| QF-112 | Job post provenance and age | P1 | Built | first_seen, last_seen, posted, age badge, repost badge | typecheck |
| QF-113 | Job result exports | P2 | Built | jobstore.exportSaved CSV/JSON/Markdown; buttons in My applications | typecheck |
| QF-114 | Guided first-launch wizard | P1 | Built | Onboarding.tsx (purpose, profile, ideal customer, privacy); shown once, skippable | preview |
| QF-115 | One-click offline sample/demo data | P1 | Not done (owner decision) | Conflicts with the owner's "real data only" rule; the browser preview keeps its demo data, the app does not | — |
| QF-116 | Distinct Business and Career workspaces | P1 | Built | settings.workspace; Business / Career / Both switch in the sidebar | preview |
| QF-117 | Advanced search preview and estimate | P1 | Built | jobs.previewSearch; Find → Preview (0.13.0) | preview |
| QF-118 | Safe export wizard with field mapping | P2 | Built | ExportWizard.tsx + exportLeads options (columns, do-not-contact, one row per email) | typecheck, preview |
| QF-119 | Encrypted database backups and recovery | P1 | Done | backupcrypto.ts (AES-256-GCM + scrypt), backup.ts (checked restore at next start, safety copy) | test/crm.test.ts |
| QF-120 | Per-feature privacy disclosures | P1 | Built | privacy.ts summary; Settings → Privacy; onboarding notes | typecheck |
| QF-121 | App signing and macOS notarization | P1 | Partial | Signing/notarization wired and conditional; SHA256SUMS; needs Apple Developer ID and Windows certificates | Release v0.19.1 built on 3 platforms |
| QF-122 | Accessibility and keyboard support | P2 | Built | axe-core audit of 9 screens: no serious or critical violations left; skip link, focus, reduced motion, RTL | axe-core run (manual, in browser preview) |
| QF-123 | Localized interface and regional defaults | P3 | Partial | 6 languages for menus, titles and workspace switch; RTL for Arabic and Urdu; content screens English | — |
| QF-124 | Trusted source audit logs and diagnostics | P1 | Done | diagnostics.ts with safety.redact; Settings → Privacy → Save a diagnostics file | test/safety.test.ts (redaction) |

## Totals

- Built: 65
- Done: 46
- Blocked: 7
- Partial: 5
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
