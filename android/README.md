# Quarrix Android 1.0.0

Native Java Android application; separate from desktop. Android 8.0+ (API 26), target API 36. No account, hosting, tracking SDK or mandatory API key.

## Features

- Discover recent jobs via public Jobicy and Arbeitnow feeds, with source-linked results and explicit provider status. Limited remote/European coverage; no claim of global completeness.
- Search the official French business registry (France only); official registration status is not a guarantee of reliability or a contact verification.
- Save up to 500 opportunities on-device and track application or customer-research status.
- Local CV keyword overlap, not a hiring prediction or independent employer verification.
- Hourly feed caching and dated offline fallback up to seven days; business cache applies only to the same query. No background scraping or contacting businesses.

## Build and test

JDK 21, Gradle 9.6.1, Android SDK 36. From `android/`:

```sh
gradle :app:assembleDebug :app:lintDebug :app:bundleRelease
```

GitHub Android CI builds the debug APK and unsigned release bundle as validation artifacts. A public APK/AAB requires a persistent owner-controlled signing key, device validation and explicit release approval. Never commit a signing key. Debug artifacts are not production releases. Desktop versions and Android versions are independent.

Profile keywords, saved records and tracking state are stored in app-private preferences, excluded from backup. Clear app data to remove them. Searches contact the selected public sources directly; no profile data is sent. Android edition currently has no desktop sync or full desktop feature parity.
