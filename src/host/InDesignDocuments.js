/**
 * Adapter over the InDesign document model: the only module that reads or opens documents.
 *
 * Verified in InDesign 21.6 / UXP 9.3.0 (ADR-001 "Platform facts"): `Document.fullName`
 * is a Promise resolving to an entry with `nativePath`, and reading it throws for a
 * never-saved document; `app.open` is synchronous and accepts a raw native path.
 */
class InDesignDocuments {
    /**
     * @param {object} params
     * @param {object} params.app - The InDesign `app` object from `require("indesign")`.
     */
    constructor({ app }) {
        this.app = app;
    }

    /**
     * Lists every open document with its on-disk path, or `null` when it has no file yet.
     * @returns {Promise<{ name: string, path: string|null, modified: boolean }[]>}
     */
    async listOpenDocuments() {
        const documents = [];
        for (let index = 0; index < this.app.documents.length; index++) {
            const document = this.app.documents.item(index);
            documents.push({
                name     : document.name,
                path     : await this.resolvePath(document),
                modified : Boolean(document.modified),
            });
        }
        return documents;
    }

    /**
     * Opens a document by absolute path. InDesign shows its own dialogs (missing fonts or
     * links) during the open; the interaction level is intentionally left unchanged.
     * @param {string} path - Absolute native path.
     * @returns {{ name: string }} The opened (or already open) document's name.
     * @throws {Error} When InDesign cannot open the file.
     */
    openDocument(path) {
        const document = this.app.open(path);
        return { name : document.name };
    }

    /**
     * Resolves a document's native path; untitled and unresolvable documents yield null.
     * @param {object} document
     * @returns {Promise<string|null>}
     */
    async resolvePath(document) {
        try {
            const entry = await document.fullName;
            if (entry && typeof entry.nativePath === 'string' && entry.nativePath !== '') {
                return entry.nativePath;
            }
            return null;
        }
        catch (_error) {
            // InDesign throws "Unsaved documents have no full name." for never-saved documents.
            return null;
        }
    }
}

module.exports = {
    InDesignDocuments,
};
