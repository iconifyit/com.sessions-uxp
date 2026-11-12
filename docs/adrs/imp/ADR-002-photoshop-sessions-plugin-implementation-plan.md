# ADR-002 Implementation Plan: Photoshop Sessions Plugin

Governing design: [ADR-002](../ADR-002-photoshop-sessions-plugin/ADR-002-photoshop-sessions-plugin.md), amending [ADR-001](../ADR-001-indesign-uxp-sessions-plugin/ADR-001-indesign-uxp-sessions-plugin.md).

**Scope contract:** This work adds the Photoshop Sessions plugin described in ADR-002, with the per-host build it requires, and nothing else.

## Delivery

Two pull requests against `develop`, each from its own `claude/` branch, reviewed by Archie then Koala before the PR is opened, with Copilot's review addressed before merge.

1. **ADR PR** — ADR-002 and this plan. Merged after the user approves the design.
2. **Implementation PR** — build, Photoshop adapter, host selection, tests, README, version 0.3.0.

## Changes by component

| Component | Change |
| --- | --- |
| Session Catalog | `resolveSessionsLocation({ homeDirectory, platform, pluginFolder })`; callers pass the plugin id as the folder. |
| Host Integration | New `src/host/PhotoshopDocuments.js` (contract in ADR-002 §4). `InDesignDocuments` unchanged. `isAbsolutePath` moves to the shared helper `src/shared/paths.js`, used by the Catalog and Host Integration. |
| Session Workflows | `openSession` awaits `openDocument`. |
| Host selection / composition root | New pure `src/hosts.js` (host table + `selectHost(hostName, { requireHost })`, unit-tested); `src/main.js` calls it with `uxp.host.name` and `require`, then builds the storage location from the plugin id. |
| Packaging | `hosts/indesign/manifest.json` (moved from the root, unchanged except location), `hosts/photoshop/manifest.json`, `scripts/build.mjs` (`npm run build` rebuilds each `dist/<host>/` from empty; `npm run package` zips each with `manifest.json` at the archive root), `dist/` ignored. Root `manifest.json` removed. `eslint.config.js` ignores `dist/**` (ESLint does not read `.gitignore`); Jest only matches `test/`. |

## Implementation order (commit checklist)

- [x] `test:` red test — an asynchronously rejecting `openDocument` must be counted as failed by `openSession` (fails before the fix).
- [x] `fix:` `openSession` awaits `openDocument`.
- [x] `feat:` `resolveSessionsLocation` takes the plugin folder; tests for both plugin ids on macOS and Windows.
- [x] `feat:` `PhotoshopDocuments` with Jest tests against a fake reproducing the observed Photoshop behavior (string `path`, `""` for untitled, cloud identifier, non-absolute identifier, entry-only `app.open`, modal scope, `app.open` resolving without a document → rejected).
- [x] `feat:` `src/hosts.js` host table and `selectHost` with tests (each mapping, lazy require of only the selected host, unknown host throws); `main.js` wiring.
- [x] `build:` per-host manifests, `scripts/build.mjs`, npm scripts, `.gitignore`; manifest tests cover both manifests (shared `VERSION`, distinct plugin ids, each `src/hosts.js` plugin id equal to that host manifest's `id` (imported, not string-matched), `host.app`/`minVersion`, identical permissions, panel id matches `main.js`, every referenced file present among the shared files the build copies).
- [x] `test:` in-host suite for both hosts: shared check core with thin entry scripts (`verify.idjs`, `verify.psjs`); `npm run test:host -- --host indesign|photoshop`. Photoshop runs via `open -a`; cleanup closes only suite-created documents (by id or by path inside the run's work folder).
- [x] `docs:` ADR-001 pointer document notes the amendment by ADR-002.
- [x] `docs:` README (both hosts, build and load instructions, storage folders) and version 0.3.0 (`VERSION`, `package.json`, `package-lock.json`, both manifests).

## Verification

- Jest and lint pass.
- In-host suite passes in InDesign (regression after the layout change) and in Photoshop.
- Both `.ccx` packages install with Adobe's UnifiedPluginInstallerAgent; each host's UXP log shows the plugin loading without errors.
- The user's existing InDesign sessions still list after the InDesign plugin updates in place.
- Manual checks by the user in Photoshop: the panel's appearance, right-click on a session, the Save → close → Open round trip, and cancelling an open-time prompt (the file is reported as not opened).

"Done" means the automated checks above pass, Archie and Koala have signed off, Copilot reports no open issues, and the in-host suites pass in both hosts before merge.
