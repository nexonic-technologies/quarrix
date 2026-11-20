# What still needs your accounts

Quarrix runs without any of these. Each one turns on an optional feature.

| Needed for | What to get | Where it goes |
|---|---|---|
| Signed macOS app (no "unidentified developer" warning) | Apple Developer Program membership, a "Developer ID Application" certificate, an app-specific password | GitHub secrets: CSC_LINK, CSC_KEY_PASSWORD, APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID (docs/RELEASING.md) |
| Signed Windows installer | A code-signing certificate (OV or EV) | GitHub secrets: WIN_CSC_LINK, WIN_CSC_KEY_PASSWORD |
| Gmail / Microsoft sign-in, Google Sheets | Your own OAuth app: Google Cloud "Desktop app" client (Gmail API on), Azure "Mobile and desktop" app with SMTP.Send and IMAP.AccessAsUser.All | Settings → Email |
| Google Places, TomTom, Foursquare | API keys from each provider | Settings → Sources |
| Email finding and mailbox checks | Hunter or ZeroBounce key | Settings → Ideal customer |
| SendGrid sending | SendGrid API key with Mail Send, and a verified sender | Settings → Email → More mailboxes |
| WhatsApp Cloud API | Meta Business account, a WhatsApp phone number ID and token, and each person's opt-in | Settings → WhatsApp |
| HubSpot, Notion, PostgreSQL, S3 | A private app token, an integration token, a database link, storage keys | Settings → Connections |

## Not possible with authorised access

- **Glassdoor, ZipRecruiter, SEEK / JobStreet / JobsDB, Naukri, Bayt, BDJobs, HelloWork:** partner-only APIs, or none at all.
- **Live Overture Maps queries:** Overture publishes files, not a query API. Use the file import instead.
- **Shared team workspaces:** these need a hosted sync service; Quarrix keeps data on one computer.
