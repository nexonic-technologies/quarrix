# Quarrix

**Quarrix — Discover Opportunities. Build Your Career. Grow Your Business.**

A local-first desktop workspace for job discovery, career exploration and business development that keeps your information on your computer.

**Download:** [latest release](https://github.com/nexonic-technologies/quarrix/releases/latest) for macOS (Apple silicon and Intel), Windows and Linux.

## What it does

- **Unified opportunities.** Review daily application and watchlist deadlines, manage saved searches, and opt into a local daily reminder. Compare scoped sales by currency, segment customers, add proposal validity and discounts, review posting-grounded skill wording, and open authorized regional public data services. Public SEC and BLS lookups distinguish official company filing data and broad hourly earnings from individual job offers or licensing claims.

- **Find customers or find a job.** Two dashboard entry points take you directly to the relevant search. Optional recommendations use recorded match and evidence scores; review freshness and conflicts before acting. Look up legal-entity name and country candidates in the public GLEIF register, and compare advertised salary ranges by currency. Registry matches do not verify contacts or vacancies; advertised salaries are not market averages.

- **Explore careers.** Compare your skills and target role against 1,016 occupations, understand matching evidence, explore skills to develop and search for real vacancies, with no mandatory account or model.
- **Review job trust.** Check listing evidence, employer careers-page corroboration and contextual recruitment warning signs before applying. An evidence score is not a guarantee of legitimacy.
- **Manage applications.** Review extracted resume text, practice interview prompts, keep drafts and plan deadlines, interviews, follow-ups and next actions locally.
- **Compare markets.** Explore stored business records by category, location, source and linked company; compare data coverage and recorded fit, with local aggregate CSV export.
- **Prepare proposals and reports.** Create editable service quotations, record proposal status, and export PDF or Word documents. Export branded market reports from your stored business samples.
- **Explore public opportunities.** Open official government job and procurement portals, browse recent standard EU contract notices, and maintain a local watchlist with deadlines and document checklists.

- **Find businesses anywhere.** Type a kind of business and a place, for example *dentists in Austin, Texas*. Quarrix searches Google Maps, OpenStreetMap and, with your own key, the Google Places API. Over 140 categories, or type your own.
- **Fill in the details.** For each business it visits the business's own website for published email addresses, phone numbers and social profiles, reads its address details, and checks the site (HTTPS, mobile-ready, outdated footer, contact form, optional Google PageSpeed score).
- **Your database, on your computer.** Search, filter, tag, add notes and track each lead from New to Won. Duplicates are merged automatically.
- **Import and export.** Bring in CSV, Excel, JSON or PDF lists; export to Excel, CSV or JSON.
- **Personal emails.** Describe what you offer once. Quarrix drafts an email and follow-ups for each business, using any model you choose (Anthropic, OpenAI, Gemini, OpenRouter, Groq) or a free model running on your own computer (Ollama, LM Studio). No model? It uses clean built-in templates.
- **Careful sending.** Emails go from your own Gmail, Outlook or SMTP mailbox, in the recipient's working hours, with a daily limit that grows slowly. Follow-ups stop by themselves when someone replies, bounces or asks to stop.
- **Client workspaces.** Agencies keep each client's leads, deals, tasks, messages, exports, syncs, automations and webhooks apart; inside a client workspace nothing from another client can be seen or changed.
- **Six languages.** English, Urdu, Arabic (right to left), Spanish, French and German across every screen (machine translation, native review welcome).
- **WhatsApp, safely.** Open WhatsApp with the drafted message ready to send, or use Meta's official WhatsApp Business Cloud API for contacts who opted in. Quarrix never automates a personal WhatsApp account.

## Privacy

Leads, settings and messages are stored only on your computer. Passwords and API keys are encrypted with your system keychain. Quarrix sends nothing to Nexonic Technologies.

## Use it responsibly

Contact businesses about their business, include a way to opt out, honour every opt-out, and follow the rules of the countries you contact (for example CAN-SPAM in the US, CASL in Canada and PECR in the UK). Scraping some sites may conflict with their terms; Google Maps searches run slowly on your own computer, and the Places API and OpenStreetMap are available as alternatives.

## Build from source

```bash
npm install
npm run dev        # run the app
npm test           # tests
npm run dist       # installers for this computer, in dist/
```

Releases are built by GitHub Actions for macOS, Windows and Linux whenever the version in `package.json` changes on `main`. Each installer is installed and started on its own platform (installed-app smoke test) and its signature state is checked before the release is published; see [docs/RELEASING.md](docs/RELEASING.md). Current builds are unsigned until certificates are added ([docs/CREDENTIALS.md](docs/CREDENTIALS.md)).

## Licence

MIT. Made by [Nexonic Technologies](https://nexonictechnologies.com).

## Desktop 4.0 — Performance & Verified Intelligence

International job locations and work arrangements stay distinct during deduplication. Job-board failures are reported rather than treated as empty successes, and completed provider deadlines release their timers. Original source evidence remains essential; a result is not a guarantee of legitimacy.

## Android 1.0.0

The [native Android edition](android/README.md) is a separate mobile application with local opportunity storage, source-linked searches and skill matching. CI validation and production signing are required before public distribution.
