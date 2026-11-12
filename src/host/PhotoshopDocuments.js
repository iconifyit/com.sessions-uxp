const { isAbsolutePath } = require('../shared/paths.js');

/**
 * Adapter over the Photoshop document model (ADR-002 §4).
 *
 * Verified in Photoshop 27.11 / UXP 9.4.1: `Document.path` is a string — the native path
 * on disk, `""` for a never-saved document, or an identifier for a cloud document;
 * `app.open` accepts only a file entry and must run inside `core.executeAsModal`.
 */
class PhotoshopDocuments {
    /**
     * @param {object} params
     * @param {object} params.app - `require("photoshop").app`.
     * @param {object} params.core - `require("photoshop").core`.
     * @param {object} params.localFileSystem - `require("uxp").storage.localFileSystem`.
     */
    constructor({ app, core, localFileSystem }) {
        this.app             = app;
        this.core            = core;
        this.localFileSystem = localFileSystem;
    }

    /**
     * Lists every open document with its on-disk path, or `null` when it has no file on disk.
     * @returns {Promise<{ name: string, path: string|null, modified: boolean }[]>}
     */
    async listOpenDocuments() {
        const documents = [];
        for (let index = 0; index < this.app.documents.length; index++) {
            const document = this.app.documents[index];
            documents.push({
                name     : document.name,
                path     : this.resolvePath(document),
                modified : !document.saved,
            });
        }
        return documents;
    }

    /**
     * Opens a document by absolute path in its own modal operation. Photoshop's open-time
     * prompts (color profile, missing fonts) are shown to the user (`interactive: true`).
     * @param {string} path - Absolute native path.
     * @returns {Promise<{ name: string }>} The opened (or already open) document's name.
     * @throws {Error} When the file is missing, cannot be opened, Photoshop is busy, or the
     *   open ends without a document (for example the user cancels a prompt).
     */
    async openDocument(path) {
        // UXP encodes the file URL itself, so the raw native path is used.
        const entry    = await this.localFileSystem.getEntryWithUrl(`file:${path}`);
        const document = await this.core.executeAsModal(
            () => this.app.open(entry),
            { commandName : 'Open Session Document', interactive : true },
        );
        if (!document) {
            throw new Error('not opened');
        }
        return { name : document.name };
    }

    /**
     * A document's native path, or null for untitled, cloud, and other non-file documents.
     * @param {object} document
     * @returns {string|null}
     */
    resolvePath(document) {
        if (document.cloudDocument === true) {
            return null;
        }
        return isAbsolutePath(document.path) ? document.path : null;
    }
}

module.exports = {
    PhotoshopDocuments,
};
