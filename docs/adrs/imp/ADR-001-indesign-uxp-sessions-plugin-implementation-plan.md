# ADR-001 Implementation Plan: InDesign UXP Sessions Plugin

Governing design: [ADR-001](../ADR-001-indesign-uxp-sessions-plugin/ADR-001-indesign-uxp-sessions-plugin.md) (current version 0.0.2)

Layout note: [ADR-002](../ADR-002-photoshop-sessions-plugin/ADR-002-photoshop-sessions-plugin.md) moved the manifest to `hosts/indesign/manifest.json` and added a copy-only build into `dist/`; references to a root `manifest.json` and to an inline script in `index.html` below describe the v0.1.0–v0.2.0 layout; `index.html` now loads a root `index.js`.

**Scope contract:** This work delivers the InDesign UXP Sessions plugin described in ADR-001, and nothing else.

## Delivery

Two pull requests against `develop`, each from its own `claude/` branch, each reviewed by Archie then Koala before the PR is opened, and Tess after convergence.

1. **ADR PR** — this ADR and plan. Merged after the user approves the design; the ADR status changes to Accepted in that PR.
2. **Implementation PR** — the plugin, tests, tooling, README, and `VERSION`.

## Repository layout

```text
com.sessions-uxp/
  VERSION                     # 0.1.0, kept in sync with package.json and manifest.json
  package.json                # dev tooling only (jest, eslint); no runtime dependencies
  eslint.config.js
  jest.config.js
  manifest.json
  index.html                  # panel markup; loads src/main.js through an inline require
  icons/                      # panel-dark, panel-light, plugin; each as name@1x.png and name@2x.png
  src/
    main.js                   # entrypoints.setup, composition root
    shared/
      fsErrors.js             # classifies UXP (numeric) and Node (string) fs error codes
    sessions/
      session.js              # createSession, parseSession, sortNewestFirst, id/name generation
      SessionStore.js         # list/get/create/update/remove over injected fs + directory
      storageLocation.js      # resolves <appData>/com.atomic/com.atomic.indesign-sessions/sessions
    host/
      InDesignDocuments.js    # listOpenDocuments, openDocument
      Platform.js             # pickFolder, copyFile, fileExists, openPath, openExternal
    workflows/
      SessionWorkflows.js     # inspect/save/open/copy/collect use cases
      fileNames.js            # uniqueTargetName
    ui/
      panel.js                # list rendering, selection, session and flyout menu commands
      contextMenu.js          # right-click session menu (ADR-001 v0.0.3)
      dialogs.js              # <dialog>-based text-input and confirm dialogs
      messages.js             # result-message formatting (pure, unit-tested)
      styles.css              # prefers-color-scheme themed styles
  test/
    support/nodeFs.js         # Node fs/promises restricted to the ADR-001 §3 fs subset
    support/fakeInDesign.js   # fake app.documents / app.open matching observed InDesign behavior
    sessions/*.test.js
    workflows/*.test.js
    host/*.test.js            # UXP services stubbed per test; collaborators are injected, so no module mapping
    ui/messages.test.js
    ui/contextMenu.test.js
    manifest.test.js
    host-verification/
      run.mjs                 # drives InDesign via osascript, waits for results, closes suite documents
      verify.idjs             # UXP script exercising the real src/ modules inside InDesign
      config.generated.js     # per-run settings written by run.mjs (gitignored)
  docs/
    adrs/...
  README.md
```

## Implementation order (commit checklist)

- [x] `chore:` tooling — `package.json` (jest, eslint, scripts `test`, `lint`, `test:host`), `VERSION` 0.1.0, Jest config, ESLint flat config.
- [x] `feat:` Session Catalog — `session.js`, `storageLocation.js`, `SessionStore.js` with tests. Tests inject `test/support/nodeFs.js`, which wraps Node `fs/promises` and exposes only the `fs` subset listed in ADR-001 §3, against a per-test temp directory.
- [x] `feat:` Host Integration — `InDesignDocuments.js`, `Platform.js` with tests against the `test/support` fakes and per-test stubs.
- [x] `feat:` Session Workflows — `SessionWorkflows.js`, `fileNames.js` with tests using in-memory fakes of the catalog and host.
- [x] `feat:` Panel UI and manifest — `manifest.json`, `index.html`, `src/ui/*`, `src/main.js`, icons; manifest test.
- [x] `test:` in-host verification suite (`npm run test:host`) and a recorded passing run: 17/17 checks on InDesign 21.6.0.57 (UXP 9.3.0), macOS, 2026-11-08. The packaged plugin was also installed with Adobe's UnifiedPluginInstallerAgent and loaded without errors in the UXP log.
- [x] `docs:` README (install via UXP Developer Tool, usage, storage location, permissions, how to run both test suites).

## Testing strategy

Automated (Jest, Node 22, frozen clock at a fixed ISO timestamp, realistic Dropbox-style paths with spaces and Unicode):

- **Session Catalog:** round-trip create → get → list; newest-first ordering after a rename; quotes, newlines, and Unicode in name/description survive; invalid JSON and wrong-shape files are excluded and reported, never modified; an existing `<id>.json` stays byte-identical when the fs fake's `writeFile` throws, and separately when `rename` throws, during `update`, and `list()` ignores the leftover `.tmp`; two concurrent updates of one session, each pausing mid-write, still leave a valid session file; `create` regenerates the id on a collision and never replaces an existing session; identity: a file whose inner `id` differs from its filename (mismatched or duplicated copy) is reported invalid and never written or deleted, and `filePathFor` rejects traversal ids such as `../../Documents/notes`; `createdAt` that is not an ISO date and relative or empty `files` entries make a file invalid; `update` cannot change `id`/`createdAt`; `remove` of a missing id fails clearly; storage path per platform.
- **Host Integration:** `listOpenDocuments` returns path for saved documents and marks untitled/unresolvable ones; awaits `fullName` and reads `nativePath`; treats a throwing `fullName` as untitled; `openDocument` passes the raw native path to `app.open` and propagates open errors.
- **Session Workflows:** save excludes untitled documents and reports the count; save with zero savable documents creates nothing; open reports opened / already open / missing / failed and continues after a failure; copy and collect never overwrite and apply `name (2).ext` suffixes, including two same-basename sources from different folders in one batch and a target created by another process after the availability check; collect skips untitled documents and reports the count; already-open matching treats paths that differ only by letter case, a trailing separator, or a `..` segment as the same file; `uniqueTargetName` boundaries (no extension, dotted names, existing `(2)`).
- **Manifest:** `host.app` is `ID`, `minVersion` is `20.0.0`, required permissions present, versions match `VERSION` and `package.json`, the panel id matches the id registered in `main.js`.
- `npm run lint` clean.

In-host (`npm run test:host`, macOS): `test/host-verification/run.mjs` uses `osascript` to have InDesign run UXP scripts that load the plugin's real `src/` modules and exercise them against test documents the suite creates in a temporary folder. The suite closes only the documents it created, identified by their path inside that folder, never a document it did not open. Every in-host script catches its own errors and reports them in its result file, so no InDesign error dialog is raised. It verifies:

1. `listOpenDocuments` returns native paths for saved documents and counts untitled ones.
2. `openDocument` opens paths with spaces, `#`, `%`, and non-ASCII characters.
3. Save → close → open round trip through `SessionWorkflows` against a real sessions folder in the temp directory: opened, already-open, missing, and failed counts are correct.
4. Copy and Collect produce `name (2).ext` on collision and never overwrite; the exclusive copy and exclusive session create refuse to replace existing files through the UXP `fs`.
5. `SessionStore` create, update (rename over an existing file), and remove against the UXP `fs` module.

The panel itself is loaded in InDesign through the UXP Developer Tool and checked for loading without errors and for rendering in the current theme. Consent prompts from `shell.openPath`/`openExternal` and Windows are not covered by automated runs; Windows uses the same code paths with the `%APPDATA%` storage root.

"Done" for the implementation PR means the Jest suite, lint, and the in-host suite pass, the panel loads in InDesign, and Archie and Koala have signed off. The PR is merged only after the in-host suite passes.

## Versioning

`VERSION`, `package.json` `version`, and `manifest.json` `version` start at `0.1.0` and move together (repo-versioning rule).
