# What still needs your accounts

Quarrix runs without any of these. Each one turns on an optional feature.

| Needed for | What to get | Where it goes |
|---|---|---|
| Signed and notarized macOS app (no "unidentified developer" warning) | Apple Developer Program membership (paid), a "Developer ID Application" certificate exported as .p12, an app-specific password for the Apple ID, the 10-character Team ID | GitHub secrets, all five: CSC_LINK (base64 of the .p12), CSC_KEY_PASSWORD, APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID. The release then verifies with codesign, spctl and stapler (docs/RELEASING.md) |
| Signed Windows installer | An OV code-signing certificate as .pfx (EV certificates on hardware tokens cannot be used from GitHub-hosted runners; they need a cloud signing service) | GitHub secrets: WIN_CSC_LINK (base64 of the .pfx), WIN_CSC_KEY_PASSWORD. The release verifies the Authenticode signature |
| Gmail sign-in and Google Sheets | Your own Google Cloud OAuth client of type "Desktop app" (Gmail API and Sheets API on) and its secret | Settings → Email → Google client ID and secret |
| Microsoft 365 / Outlook sign-in | Your own Azure app registration: "Mobile and desktop" redirect http://localhost, public client flows allowed, SMTP.Send and IMAP.AccessAsUser.All delegated permissions | Settings → Email → Microsoft application ID and tenant (common, organizations or your tenant ID for single-tenant apps) |
| Google Places, TomTom, Foursquare | API keys from each provider | Settings → Sources |
| Email finding and mailbox checks | Hunter or ZeroBounce key | Settings → Ideal customer |
| SendGrid sending | SendGrid API key with Mail Send, and a verified sender | Settings → Email → More mailboxes |
| WhatsApp Cloud API | Meta Business account, a WhatsApp phone number ID and token, and each person's opt-in | Settings → WhatsApp |
| HubSpot, Notion, PostgreSQL, S3 | A private app token, an integration token, a database link, storage keys | Settings → Connections |

## Not possible with authorised access

- **Glassdoor, ZipRecruiter, SEEK / JobStreet / JobsDB, Naukri, Bayt, BDJobs, HelloWork:** partner-only APIs, or none at all.
- **Live Overture Maps queries:** Overture publishes files, not a query API. Quarrix reads the release files directly (footers, then only the matching map blocks); very large areas stop at a read limit and say the result is partial.
- **Shared team workspaces:** these need a hosted sync service; Quarrix keeps data on one computer.
