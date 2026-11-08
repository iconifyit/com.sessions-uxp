# ADR-001 Implementation Plan: InDesign UXP Sessions Plugin

Governing design: [ADR-001 v0.0.1](../ADR-001-indesign-uxp-sessions-plugin/ADR-001-indesign-uxp-sessions-plugin-0.0.1.md)

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
  index.html
  icons/                      # panel icons (light/dark, 1x/2x)
  src/
    main.js                   # entrypoints.setup, composition root
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
      panel.js                # list rendering, selection, action bar, flyout handlers, messages
      dialogs.js              # <dialog>-based text-input and confirm dialogs
      styles.css              # prefers-color-scheme themed styles
  test/
    __mocks__/indesign.js     # minimal app.documents / app.open fake
    __mocks__/uxp.js          # localFileSystem / shell fakes
    support/nodeFs.js         # Node fs/promises restricted to the ADR-001 §3 fs subset
    sessions/*.test.js
    workflows/*.test.js
    host/*.test.js
    manifest.test.js
  docs/
    adrs/...
    MANUAL-VERIFICATION.md    # in-host checklist (see below)
  README.md
```

## Implementation order (commit checklist)

- [ ] `chore:` tooling — `package.json` (jest, eslint, scripts `test`, `lint`), `VERSION` 0.1.0, Jest `moduleNameMapper` for `indesign` and `uxp`, ESLint flat config.
- [ ] `feat:` Session Catalog — `session.js`, `storageLocation.js`, `SessionStore.js` with tests. Tests inject `test/support/nodeFs.js`, which wraps Node `fs/promises` and exposes only the `fs` subset listed in ADR-001 §3, against a per-test temp directory.
- [ ] `feat:` Host Integration — `InDesignDocuments.js`, `Platform.js` with tests against the mocks.
- [ ] `feat:` Session Workflows — `SessionWorkflows.js`, `fileNames.js` with tests using in-memory fakes of the catalog and host.
- [ ] `feat:` Panel UI and manifest — `manifest.json`, `index.html`, `src/ui/*`, `src/main.js`, icons; manifest test.
- [ ] `docs:` README (install via UXP Developer Tool, usage, storage location, permissions) and `docs/MANUAL-VERIFICATION.md`.

## Testing strategy

Automated (Jest, Node 22, frozen clock at a fixed ISO timestamp, realistic Dropbox-style paths with spaces and Unicode):

- **Session Catalog:** round-trip create → get → list; newest-first ordering after a rename; quotes, newlines, and Unicode in name/description survive; invalid JSON and wrong-shape files are excluded and reported, never modified; atomic write leaves no `.tmp` on success; `update` cannot change `id`/`createdAt`; `remove` of a missing id fails clearly; storage path per platform.
- **Host Integration:** `listOpenDocuments` returns path for saved documents and marks untitled/unresolvable ones; handles `fullName` returned directly or as a Promise and exposing `nativePath` or `fsPath`; `openDocument` converts the path to an Entry and propagates open errors.
- **Session Workflows:** save excludes untitled documents and reports the count; save with zero savable documents creates nothing; open reports opened / already open / missing / failed and continues after a failure; copy and collect never overwrite and apply `name (2).ext` suffixes; `uniqueTargetName` boundaries (no extension, dotted names, existing `(2)`).
- **Manifest:** `host.app` is `ID`, `minVersion` is `20.0.0`, required permissions present, versions match `VERSION` and `package.json`, the panel id matches the id registered in `main.js`.
- `npm run lint` clean.

Manual (`docs/MANUAL-VERIFICATION.md`, run by the user in InDesign through the UXP Developer Tool, because host behavior cannot be exercised outside InDesign):

1. What `Document.fullName` returns for saved, untitled, and converted documents.
2. `app.open` with an Entry from `getEntryWithUrl`.
3. Already-open documents are skipped rather than reopened.
4. Missing-font / missing-link dialogs appear and opening continues afterward.
5. `shell.openPath` on the sessions folder and a session `.json` (consent prompt, `launchProcess.extensions` format).
6. UXP `fs.rename` replaces an existing `<id>.json` (exercised by Rename and Describe on an existing session).
7. Theme follows InDesign light/dark.
8. Smoke test: open three documents (one untitled) → Save → close all → Open → three-minus-one reopen, summary correct; Rename, Describe, Copy Files (with a name collision), Collect, Delete.
9. Windows (when a Windows machine is available): sessions folder resolves under `%APPDATA%`, and the smoke test passes.

"Done" for the implementation PR means the automated suite and lint pass, Archie and Koala have signed off, and the manual checklist exists. The PR is then merged; in-host results are reported by the user, and any defect found is fixed in a follow-up PR. Host behavior in items 1–2 (document paths and opening) is the main residual risk of merging before an in-host run.

## Versioning

`VERSION`, `package.json` `version`, and `manifest.json` `version` start at `0.1.0` and move together (repo-versioning rule).
