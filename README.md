# Sessions for Adobe InDesign and Photoshop

Sessions is a UXP panel for Adobe InDesign and Adobe Photoshop that saves the locations of all open documents as a named work session, so you can close everything and later reopen the same set of files in one step. It is the UXP counterpart of the CEP `com.sessions` extension for Illustrator.

The design is recorded in [ADR-001](docs/adrs/ADR-001-indesign-uxp-sessions-plugin/ADR-001-indesign-uxp-sessions-plugin.md) (InDesign) and [ADR-002](docs/adrs/ADR-002-photoshop-sessions-plugin/ADR-002-photoshop-sessions-plugin.md) (Photoshop and the per-host build).

## Requirements

- Adobe InDesign 20.0 (InDesign 2025) or later, and/or Adobe Photoshop 26.0 (Photoshop 2025) or later; macOS or Windows.

## Building

Each app gets its own plugin, built from the same source:

```sh
npm run build     # dist/indesign/ and dist/photoshop/
npm run package   # also dist/com.atomic.indesign-sessions-<version>.ccx and dist/com.atomic.photoshop-sessions-<version>.ccx
```

## Installing

**For development:** run `npm run build`, open the Adobe UXP Developer Tool, choose **Add Plugin**, select `dist/indesign/manifest.json` or `dist/photoshop/manifest.json`, then **Load**. Rebuild after changing the source. In InDesign the panel is under **Plug-Ins → Sessions**; in Photoshop it is under **Plugins → Sessions**.

**As a package:** run `npm run package`, then double-click a `.ccx` in `dist/`, or run Adobe's `UnifiedPluginInstallerAgent --install "$PWD/dist/<file>.ccx"` — the installer needs an absolute path (a relative path fails with status -160). Each package installs into its own app. Remove one with `UnifiedPluginInstallerAgent --remove Sessions`.

## Using the panel

| Action | Where | What it does |
| --- | --- | --- |
| Save Session | Button | Saves the open documents that exist on disk under a name (defaults to the current date and time) and optional description. Untitled documents are skipped; unsaved changes are not part of a session. |
| Open | Button, double-click a session, or Session menu | Opens the session's documents. Documents already open are left as they are; missing or unopenable documents are skipped and listed in the panel message. |
| Rename… / Describe… | Session menu | Edit the session's name or description. Hover a session to see its description. |
| Copy Files… | Session menu | Copies the session's documents into a folder you choose. Existing files are never overwritten; collisions become `name (2).indd`. Linked assets and fonts are not copied (use **File → Package** for a complete hand-off). |
| Show File | Session menu | Opens the session's JSON file in the default app. |
| Delete… | Session menu | Deletes the session after confirmation. The documents are not affected. |
| Collect Open Documents… | Panel menu | Copies the open documents into a folder you choose, with the same rules as Copy Files. |
| Show Sessions Folder | Panel menu | Opens the folder that holds the session files. |

**Session menu:** right-click a session to open it, or choose the same actions from the panel menu (☰), where they apply to the selected session.

Untitled documents (and, in Photoshop, cloud documents) have no file on disk and are skipped when saving a session. In Photoshop, the app's own prompts while opening a file (for example a color-profile mismatch) appear as usual; cancelling one reports that file as not opened.

The app asks for permission the first time the panel opens a folder, a file, or the documentation link.

## Where sessions are stored

One JSON file per session, in a separate folder for each app, so InDesign and Photoshop never see each other's sessions:

| App | macOS | Windows |
| --- | --- | --- |
| InDesign | `~/Library/Application Support/com.atomic/com.atomic.indesign-sessions/sessions/` | `%APPDATA%\com.atomic\com.atomic.indesign-sessions\sessions\` |
| Photoshop | `~/Library/Application Support/com.atomic/com.atomic.photoshop-sessions/sessions/` | `%APPDATA%\com.atomic\com.atomic.photoshop-sessions\sessions\` |

The folders do not depend on the app version, so sessions carry over when the app is upgraded. Each file is named after the session's id:

```json
{
  "schemaVersion": 1,
  "id": "20261108-143205-k3f9",
  "name": "Spring catalog",
  "description": "Layout pass",
  "createdAt": "2026-11-08T14:32:05.120Z",
  "updatedAt": "2026-11-08T14:32:05.120Z",
  "files": [
    "/Users/scott/Dropbox/clients/acme/spring-catalog/catalog-2027.indd"
  ]
}
```

Files that are not valid sessions (for example a copy whose `id` does not match its file name) are listed in the panel message and left untouched.

## Permissions

Each plugin's manifest requests full file-system access (to read and open your documents wherever they are) and permission to launch `https` links, folders, and `.json` files.

## Development

```sh
npm install
npm test           # Jest: session format, store, workflows, host adapters with fakes, messages, manifest
npm run lint       # ESLint
npm run test:host -- --host indesign    # macOS only: runs the suite inside the running InDesign
npm run test:host -- --host photoshop   # macOS only: runs the suite inside the running Photoshop
```

`npm run test:host` starts the suite in the running app (InDesign through AppleScript, Photoshop by opening a `.psjs` script). It creates test documents in a temporary folder, exercises the plugin's real modules against the app's document model and the UXP file system, and closes only the documents it created. `INDESIGN_APP` and `PHOTOSHOP_APP` override the application names (defaults `Adobe InDesign 2026` and `Adobe Photoshop 2026`).

Source layout:

| Path | Component |
| --- | --- |
| `src/sessions/` | Session Catalog: session record, storage location, `SessionStore` |
| `src/host/` | Host Integration: InDesign and Photoshop documents, and UXP platform services |
| `src/hosts.js` | Host table: plugin id and documents adapter for each app |
| `src/workflows/` | Session Workflows: save, open, copy, collect |
| `src/shared/` | Dependency-free helpers used by more than one component (file-system errors, absolute paths) |
| `src/ui/`, `index.html`, `src/main.js` | Panel UI (list, dialogs, right-click menu) and composition root |
| `hosts/<app>/manifest.json`, `scripts/build.mjs` | Per-app manifests and the copy-only build |

The version in `VERSION`, `package.json`, and both manifests is kept in sync.

## License

MIT. Copyright Scott Lewis ([Atomic Lotus](https://atomiclotus.net)).
