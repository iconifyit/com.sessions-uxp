/**
 * Minimal stand-in for the InDesign `app` object, reproducing the behavior observed in
 * InDesign 21.6 / UXP 9.3.0: `fullName` is a Promise of an entry with `nativePath`,
 * reading it throws for unsaved documents, and `app.open` is synchronous.
 */

/**
 * Builds a fake document.
 * @param {object} params
 * @param {string} params.name
 * @param {string|null} params.path - Native path, or null for a never-saved document.
 * @param {boolean} [params.modified=false]
 * @returns {object}
 */
const fakeDocument = ({ name, path, modified = false }) => ({
    name,
    modified,
    saved : path !== null,
    get fullName() {
        if (path === null) {
            throw new Error('Unsaved documents have no full name.');
        }
        return Promise.resolve({ name, type : 'file', nativePath : path });
    },
});

/**
 * Builds a fake `app` with a documents collection and an `open` that records calls.
 * @param {object} params
 * @param {object[]} [params.documents] - Initially open fake documents.
 * @param {(path: string) => void} [params.onOpen] - Called before opening; may throw to simulate a failure.
 * @returns {object}
 */
const fakeApp = ({ documents = [], onOpen = () => {} } = {}) => {
    const openDocuments = [...documents];
    const app = {
        openedPaths : [],
        documents   : {
            get length() {
                return openDocuments.length;
            },
            item : (index) => openDocuments[index],
        },
        open : (path) => {
            onOpen(path);
            app.openedPaths.push(path);
            const name     = path.split(/[\\/]/).pop();
            const document = fakeDocument({ name, path });
            openDocuments.push(document);
            return document;
        },
    };
    return app;
};

module.exports = {
    fakeApp,
    fakeDocument,
};
