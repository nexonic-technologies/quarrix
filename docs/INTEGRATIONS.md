# Quarrix integrations

Everything here is off until you turn it on in **Settings → Connections** or **Settings → Automations**.

## Local API

- Listens on `127.0.0.1` only (default port 47811). Requests from other machines and other host names are refused.
- Every call except `/v1/health` needs `Authorization: Bearer <token>`. Copy the token from Settings → Connections.
- While the API is on, the address and token are written to `api.json` in the app data folder, readable only by your user. The file is removed when the API is turned off.

| Method | Path | What it does |
|---|---|---|
| GET | `/v1/health` | Version check (no token) |
| GET | `/v1/leads?q=&grade=&status=&country=&limit=&offset=` | Leads, best grade first |
| GET | `/v1/leads/:id` | One lead with contacts, deals and activity |
| GET | `/v1/searches` | Recent searches |
| POST | `/v1/searches` `{category, place, sources[]}` | Queue a search |
| GET | `/v1/deals`, `/v1/forecast`, `/v1/tasks?open=1` | CRM |
| GET | `/v1/jobs/saved` | Your applications |
| POST | `/v1/jobs/search` `{keywords, country, …}` | Job search |
| POST | `/v1/capture` `{url, title}` | Save a business website (used by the bookmarklet) |

## Command line

Run from the Quarrix source folder while the app is open with the API on:

```
node bin/quarrix.mjs leads --grade A
node bin/quarrix.mjs search "dentists" "Austin, Texas" --sources osm,web
node bin/quarrix.mjs deals --json
```

## MCP server (for AI assistants)

Add this to your assistant's MCP configuration:

```json
{ "command": "node", "args": ["/path/to/quarrix/bin/quarrix-mcp.mjs"] }
```

- Read tools: `list_leads`, `get_lead`, `list_deals`, `list_tasks`, `forecast`, `search_jobs`.
- `start_business_search` only runs with `confirm: true`, which the assistant should set only after you agree.

## Webhooks (Zapier, Make, n8n)

- Events: `lead_created`, `lead_enriched`, `reply`, `signal`, `deal`, `sent`, `bounce`, `search_done`.
- The body is `{"event", "at", "data"}`.
- Each request carries `X-Quarrix-Signature: sha256=<hex>`, which is HMAC-SHA256 of the raw body with your webhook secret. Check it before trusting the request.
- Server errors are retried three times, with longer waits each time.
- In Zapier or Make, use a "Catch hook" trigger. In n8n, use a Webhook node.
- Webhook secrets are stored in the settings file (not in the keychain). Treat them like passwords.

## HubSpot, Notion, Google Sheets

- Select leads, then choose **Send to…**.
- Leads marked do-not-contact or on the do-not-contact list are never sent.
- **HubSpot:** companies are matched by domain and contacts by email, then associated with each other.
- **Notion:** properties are matched by name (Email, Phone, Website, City, Category, Status, Grade, Contact).
- **Google Sheets:** rows are appended to the first tab, with a header row on an empty sheet.
