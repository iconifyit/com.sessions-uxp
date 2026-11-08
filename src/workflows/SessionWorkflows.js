const { baseName, joinPath, pathKey, uniqueTargetName } = require('./fileNames.js');
const { defaultSessionName }                              = require('../sessions/session.js');
const { isAlreadyExistsError }                            = require('../shared/fsErrors.js');

const kMAX_COPY_ATTEMPTS = 100;

/**
 * User-level use cases that coordinate the Session Catalog and Host Integration.
 *
 * Workflows receive already-chosen inputs (names, target folders) and never show UI;
 * each returns a result summary the panel turns into a message (ADR-001 §4).
 */
class SessionWorkflows {
    /**
     * @param {object} params
     * @param {object} params.store - SessionStore.
     * @param {object} params.documents - InDesignDocuments.
     * @param {object} params.platform - Platform.
     * @param {boolean} params.caseInsensitivePaths - True on macOS and Windows.
     * @param {() => Date} [params.now] - Clock.
     */
    constructor({ store, documents, platform, caseInsensitivePaths, now = () => new Date() }) {
        this.now                  = now;
        this.store                = store;
        this.documents            = documents;
        this.platform             = platform;
        this.caseInsensitivePaths = caseInsensitivePaths;
    }

    /**
     * Describes which open documents a session would contain, with the default name for a new session.
     * @returns {Promise<{ savablePaths: string[], untitledCount: number, modifiedCount: number, defaultName: string }>}
     */
    async inspectOpenDocuments() {
        const openDocuments = await this.documents.listOpenDocuments();
        const savable       = openDocuments.filter((document) => document.path !== null);
        return {
            savablePaths  : savable.map((document) => document.path),
            untitledCount : openDocuments.length - savable.length,
            modifiedCount : savable.filter((document) => document.modified).length,
            defaultName   : defaultSessionName(this.now()),
        };
    }

    /**
     * Saves the open documents that have a file as a new session. Untitled documents are skipped.
     * @param {{ name: string, description?: string }} details
     * @returns {Promise<{ session: object|null, untitledCount: number }>} `session` is null when nothing was savable.
     */
    async saveOpenDocuments({ name, description }) {
        const { savablePaths, untitledCount } = await this.inspectOpenDocuments();
        if (savablePaths.length === 0) {
            return { session : null, untitledCount };
        }
        const session = await this.store.create({ name, description, files : savablePaths });
        return { session, untitledCount };
    }

    /**
     * Opens every document in a session, continuing past documents that are already
     * open, missing, or fail to open.
     * @param {string} id
     * @returns {Promise<{ opened: string[], alreadyOpen: string[], missing: string[], failed: { path: string, reason: string }[] }>}
     */
    async openSession(id) {
        const session  = await this.store.get(id);
        const openKeys = new Set();
        for (const document of await this.documents.listOpenDocuments()) {
            if (document.path !== null) {
                openKeys.add(pathKey(document.path, this.caseInsensitivePaths));
            }
        }
        const result = { opened : [], alreadyOpen : [], missing : [], failed : [] };
        for (const path of session.files) {
            const key = pathKey(path, this.caseInsensitivePaths);
            if (openKeys.has(key)) {
                result.alreadyOpen.push(path);
                continue;
            }
            try {
                if (!(await this.platform.fileExists(path))) {
                    result.missing.push(path);
                    continue;
                }
                this.documents.openDocument(path);
                openKeys.add(key);
                result.opened.push(path);
            }
            catch (error) {
                result.failed.push({ path, reason : error.message });
            }
        }
        return result;
    }

    /**
     * Copies a session's documents into a folder without overwriting anything.
     * @param {string} id
     * @param {string} folder - Absolute target folder chosen by the user.
     * @returns {Promise<{ copied: { source: string, target: string }[], missing: string[], failed: { path: string, reason: string }[] }>}
     */
    async copySessionDocuments(id, folder) {
        const session = await this.store.get(id);
        return this.copyFiles(session.files, folder);
    }

    /**
     * Copies the open documents that have a file into a folder without overwriting anything.
     * Documents with unsaved changes are copied in their last-saved state.
     * @param {string} folder - Absolute target folder chosen by the user.
     * @returns {Promise<{ copied: object[], missing: string[], failed: object[], untitledCount: number, modifiedCount: number }>}
     */
    async collectOpenDocuments(folder) {
        const { savablePaths, untitledCount, modifiedCount } = await this.inspectOpenDocuments();
        const result = await this.copyFiles(savablePaths, folder);
        return { ...result, untitledCount, modifiedCount };
    }

    /**
     * Copies files into a folder, choosing `name (2).ext`-style names for collisions with
     * existing files or with files copied earlier in the same batch.
     * @param {string[]} paths - Absolute source paths.
     * @param {string} folder - Absolute target folder.
     * @returns {Promise<{ copied: { source: string, target: string }[], missing: string[], failed: { path: string, reason: string }[] }>}
     */
    async copyFiles(paths, folder) {
        const result        = { copied : [], missing : [], failed : [] };
        const reservedNames = new Set();
        const isTaken       = async (candidate) => reservedNames.has(this.nameKey(candidate))
            || this.platform.fileExists(joinPath(folder, candidate));
        for (const source of paths) {
            try {
                if (!(await this.platform.fileExists(source))) {
                    result.missing.push(source);
                    continue;
                }
                result.copied.push({ source, target : await this.copyToFreeName(source, folder, reservedNames, isTaken) });
            }
            catch (error) {
                result.failed.push({ path : source, reason : error.message });
            }
        }
        return result;
    }

    /**
     * Copies one file under the first free name. The copy itself is exclusive, so a target
     * created by another process after the availability check is never replaced; the name
     * is reserved and the next candidate is tried.
     * @param {string} source - Absolute source path.
     * @param {string} folder - Absolute target folder.
     * @param {Set<string>} reservedNames - Names already used in this batch (mutated).
     * @param {(candidate: string) => Promise<boolean>} isTaken
     * @returns {Promise<string>} The absolute target path written.
     */
    async copyToFreeName(source, folder, reservedNames, isTaken) {
        for (let attempt = 0; attempt < kMAX_COPY_ATTEMPTS; attempt++) {
            const targetName = await uniqueTargetName(baseName(source), isTaken);
            const target     = joinPath(folder, targetName);
            reservedNames.add(this.nameKey(targetName));
            try {
                await this.platform.copyFile(source, target);
                return target;
            }
            catch (error) {
                if (!isAlreadyExistsError(error)) {
                    throw error;
                }
            }
        }
        throw new Error(`Could not find a free file name for ${baseName(source)}.`);
    }

    /**
     * Comparison key for a file name within one folder (Unicode NFC, case-folded when the
     * file system is case-insensitive).
     * @param {string} fileName
     * @returns {string}
     */
    nameKey(fileName) {
        const composed = fileName.normalize('NFC');
        return this.caseInsensitivePaths ? composed.toLowerCase() : composed;
    }
}

module.exports = {
    SessionWorkflows,
};
