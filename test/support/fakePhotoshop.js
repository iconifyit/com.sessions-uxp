/**
 * Minimal stand-ins for `require("photoshop")` and the UXP local file system, reproducing
 * the behavior observed in Photoshop 27.11 / UXP 9.4.1: `path` is a string (`""` when
 * untitled), `app.open` rejects anything but a file entry and does nothing outside
 * `executeAsModal`, and a missing file has no entry.
 */

/**
 * Builds a fake Photoshop document.
 * @param {object} params
 * @param {string} params.name
 * @param {string} params.path - Native path, `""` when untitled, or a cloud identifier.
 * @param {boolean} [params.saved=true]
 * @param {boolean} [params.cloudDocument=false]
 * @returns {object}
 */
const fakePsDocument = ({ name, path, saved = true, cloudDocument = false }) => ({ name, path, saved, cloudDocument });

/**
 * Builds the fake `app`, `core`, and `localFileSystem`.
 * @param {object} params
 * @param {object[]} [params.documents] - Initially open fake documents.
 * @param {string[]} [params.existingPaths] - Paths that have file entries.
 * @param {(path: string) => object|undefined} [params.onOpen] - Called with the entry's path; may throw, or return undefined to simulate a cancelled open.
 * @returns {{ app: object, core: object, localFileSystem: object }}
 */
const fakePhotoshop = ({ documents = [], existingPaths = [], onOpen } = {}) => {
    const openDocuments = [...documents];
    let modalDepth = 0;
    const app = {
        documents   : openDocuments,
        openedPaths : [],
        open        : async (entry) => {
            if (!entry || typeof entry.nativePath !== 'string') {
                throw new Error('Parameter must be a valid entry representing a file or a folder');
            }
            if (modalDepth === 0) {
                return undefined;
            }
            if (onOpen) {
                const result = onOpen(entry.nativePath);
                if (result === undefined) {
                    return undefined;
                }
            }
            app.openedPaths.push(entry.nativePath);
            const document = fakePsDocument({ name : entry.nativePath.split('/').pop(), path : entry.nativePath });
            openDocuments.push(document);
            return document;
        },
    };
    const core = {
        modalOptions   : [],
        executeAsModal : async (callback, options) => {
            core.modalOptions.push(options);
            modalDepth += 1;
            try {
                return await callback();
            }
            finally {
                modalDepth -= 1;
            }
        },
    };
    const localFileSystem = {
        getEntryWithUrl : async (url) => {
            const nativePath = url.replace(/^file:/, '');
            if (!existingPaths.includes(nativePath)) {
                throw new Error(`Could not find an entry of '${url}'`);
            }
            return { name : nativePath.split('/').pop(), nativePath, isFile : true };
        },
    };
    return { app, core, localFileSystem };
};

module.exports = {
    fakePhotoshop,
    fakePsDocument,
};
