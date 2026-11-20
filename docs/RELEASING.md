# Releasing Quarrix

1. Bump `version` in package.json and push to `main`.
2. The **Release** workflow runs the type check and tests, builds the macOS, Windows and Linux installers, publishes a GitHub release, and then uploads `SHA256SUMS.txt`.

## Checking a download

- macOS and Linux: `shasum -a 256 <file>`
- Windows: `certutil -hashfile <file> SHA256`

Compare the result with the matching line in `SHA256SUMS.txt` on the release page.

## Code signing (optional)

The repository's workflow secrets turn signing on. With no secrets set, the installers are unsigned. macOS then warns on first open: right-click the app and choose Open.

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
