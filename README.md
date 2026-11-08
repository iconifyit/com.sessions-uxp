# Sessions for Adobe InDesign

Sessions is a UXP panel for Adobe InDesign that saves the locations of all open documents as a named work session, so you can close everything and later reopen the same set of files in one step. It is the InDesign counterpart of the CEP `com.sessions` extension for Illustrator.

The design is recorded in [ADR-001](docs/adrs/ADR-001-indesign-uxp-sessions-plugin/ADR-001-indesign-uxp-sessions-plugin.md).

## Requirements

- Adobe InDesign 20.0 (InDesign 2025) or later, macOS or Windows.

## Installing

**For development:** open the Adobe UXP Developer Tool, choose **Add Plugin**, select this folder's `manifest.json`, then **Load**. The panel appears under **Plug-Ins → Sessions** in InDesign.

**As a package:** in the UXP Developer Tool choose **••• → Package** to produce a `.ccx` file, then double-click it (or run Adobe's `UnifiedPluginInstallerAgent --install <file>.ccx`). Remove it with `UnifiedPluginInstallerAgent --remove Sessions`.

## Using the panel

| Action | Where | What it does |
| --- | --- | --- |
| Save Session | Button | Saves the open documents that exist on disk under a name (defaults to the current date and time) and optional description. Untitled documents are skipped; unsaved changes are not part of a session. |
| Open | Button, or double-click a session | Opens the session's documents. Documents already open are left as they are; missing or unopenable documents are skipped and listed in the panel message. |
| Rename… / Describe… | Action bar | Edit the session's name or description. Hover a session to see its description. |
| Copy Files… | Action bar | Copies the session's documents into a folder you choose. Existing files are never overwritten; collisions become `name (2).indd`. Linked assets and fonts are not copied (use **File → Package** for a complete hand-off). |
| Show File | Action bar | Opens the session's JSON file in the default app. |
| Delete… | Action bar | Deletes the session after confirmation. The documents are not affected. |
| Collect Open Documents… | Panel menu | Copies the open documents into a folder you choose, with the same rules as Copy Files. |
| Show Sessions Folder | Panel menu | Opens the folder that holds the session files. |

InDesign asks for permission the first time the panel opens a folder, a file, or the documentation link.

## Where sessions are stored

One JSON file per session in:

- macOS: `~/Library/Application Support/com.atomic/com.atomic.indesign-sessions/sessions/`
- Windows: `%APPDATA%\com.atomic\com.atomic.indesign-sessions\sessions\`

The folder does not depend on the InDesign version, so sessions carry over when InDesign is upgraded. Each file is named after the session's id:

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

The manifest requests full file-system access (to read and open your documents wherever they are) and permission to launch `https` links, folders, and `.json` files.

## Development

```sh
npm install
npm test           # Jest: session format, store, workflows, host adapters with fakes, messages, manifest
npm run lint       # ESLint
npm run test:host  # macOS only: runs the suite inside the running InDesign
```

`npm run test:host` drives InDesign through AppleScript. It creates test documents in a temporary folder, exercises the plugin's real modules against the InDesign document model and the UXP file system, and closes only the documents it created. Set `INDESIGN_APP` to target an application name other than `Adobe InDesign 2026`.

Source layout:

| Path | Component |
| --- | --- |
| `src/sessions/` | Session Catalog: session record, storage location, `SessionStore` |
| `src/host/` | Host Integration: InDesign documents and UXP platform services |
| `src/workflows/` | Session Workflows: save, open, copy, collect |
| `src/ui/`, `index.html`, `src/main.js` | Panel UI and composition root |

The version in `VERSION`, `package.json`, and `manifest.json` is kept in sync.

## License

MIT. Copyright Scott Lewis ([Atomic Lotus](https://atomiclotus.net)).
