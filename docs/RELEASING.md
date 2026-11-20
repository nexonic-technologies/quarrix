# Releasing Quarrix

1. Bump `version` in package.json and push to `main`.
2. The **Release** workflow:
   - runs the type check, unit tests and integration tests;
   - builds the macOS, Windows and Linux installers into a **draft** release;
   - checks each platform's signature state (a signed build that fails `codesign`/`spctl`/`stapler` or Authenticode verification fails the release);
   - installs each installer the way a user would (DMG copy, silent NSIS install, `apt install` of the .deb), starts the installed app with `QUARRIX_SMOKE_OUT` set, and fails if any check in `src/main/smoke.ts` fails (window, first-launch wizard, every screen, workspaces, accessible names, translations and right-to-left layout, database, IPC, workspace isolation, sending approval, network guard, packaged CLI);
   - runs the live provider checks (`scripts/live.mjs`) against the keyless public sources; this is a report, not a gate;
   - uploads `SHA256SUMS.txt`, the browser extension and `live-providers.json`, writes the verification results into the release notes and publishes the draft.

Run the smoke test yourself on any build: `QUARRIX_SMOKE_OUT=report.json <path to the app>`. It uses a throwaway data folder.

## Checking a download

- macOS and Linux: `shasum -a 256 <file>`
- Windows: `certutil -hashfile <file> SHA256`

Compare the result with the matching line in `SHA256SUMS.txt` on the release page.

## Code signing (optional)

The repository's workflow secrets turn signing on, per platform: macOS signs and notarizes only when `CSC_LINK`, `APPLE_ID` and `APPLE_TEAM_ID` are all set; Windows signs when `WIN_CSC_LINK` is set. With no secrets set, the installers are unsigned and the release notes say so. macOS then warns on first open: right-click the app and choose Open (or run `xattr -dr com.apple.quarantine /Applications/Quarrix.app`). Windows SmartScreen shows "More info → Run anyway".

| Secret | What it is |
|---|---|
| `CSC_LINK` / `CSC_KEY_PASSWORD` | Apple "Developer ID Application" certificate (.p12, base64) and its password |
| `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` | Apple account used for notarization |
| `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` | Windows code-signing certificate (.pfx, base64) and its password |

To check signing on a Mac:

```
codesign --verify --deep --strict -v Quarrix.app
spctl -a -vv Quarrix.app
```
