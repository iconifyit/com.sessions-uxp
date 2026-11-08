const {
    InvalidSessionError,
    createSession,
    generateId,
    isValidId,
    normalizeName,
    parseSession,
    serializeSession,
    sortNewestFirst,
} = require('./session.js');
const { isAlreadyExistsError, isNotFoundError } = require('../shared/fsErrors.js');

/**
 * Raised when no stored session exists for an id.
 */
class SessionNotFoundError extends Error {
    /**
     * @param {string} id
     */
    constructor(id) {
        super(`Session ${id} was not found.`);
        this.name = 'SessionNotFoundError';
    }
}

/**
 * Persists sessions as one JSON file per session in a single folder (ADR-001 §3).
 *
 * The file-system dependency is injected and limited to this subset, which both the
 * UXP `fs` module and the Node test adapter provide: `mkdir`, `readdir`, `readFile`,
 * `writeFile`, `rename`, `unlink`.
 */
class SessionStore {
    /**
     * @param {object} params
     * @param {object} params.fs - File-system module providing the subset above.
     * @param {string} params.directory - Absolute sessions folder.
     * @param {string} params.separator - Path separator for the folder (`/` or `\`).
     * @param {() => Date} [params.now] - Clock.
     * @param {() => number} [params.random] - Randomness for id generation.
     */
    constructor({ fs, directory, separator, now = () => new Date(), random = Math.random }) {
        this.fs        = fs;
        this.directory = directory;
        this.separator = separator;
        this.now       = now;
        this.random    = random;
    }

    /**
     * Absolute path of the file that stores a session.
     * @param {string} id
     * @returns {string}
     * @throws {InvalidSessionError} When the id is malformed, which also prevents path traversal.
     */
    filePathFor(id) {
        if (!isValidId(id)) {
            throw new InvalidSessionError(`Invalid session id: ${JSON.stringify(id)}.`);
        }
        return `${this.directory}${this.separator}${id}.json`;
    }

    /**
     * Lists valid sessions newest-first and reports files that could not be read as sessions.
     * Invalid files are never modified.
     * @returns {Promise<{ sessions: object[], invalidFiles: { fileName: string, reason: string }[] }>}
     */
    async list() {
        await this.ensureDirectory();
        const fileNames    = await this.fs.readdir(this.directory);
        const sessions     = [];
        const invalidFiles = [];
        for (const fileName of fileNames) {
            if (!fileName.endsWith('.json')) {
                continue;
            }
            const stem = fileName.slice(0, -'.json'.length);
            try {
                const text = await this.fs.readFile(`${this.directory}${this.separator}${fileName}`, { encoding : 'utf-8' });
                sessions.push(parseSession(text, stem));
            }
            catch (error) {
                invalidFiles.push({ fileName, reason : error.message });
            }
        }
        return { sessions : sortNewestFirst(sessions), invalidFiles };
    }

    /**
     * Reads one session.
     * @param {string} id
     * @returns {Promise<object>}
     * @throws {SessionNotFoundError} When no file exists for the id.
     * @throws {InvalidSessionError} When the id or the stored file is invalid.
     */
    async get(id) {
        const filePath = this.filePathFor(id);
        let text;
        try {
            text = await this.fs.readFile(filePath, { encoding : 'utf-8' });
        }
        catch (error) {
            if (isNotFoundError(error)) {
                throw new SessionNotFoundError(id);
            }
            throw error;
        }
        return parseSession(text, id);
    }

    /**
     * Creates and stores a new session.
     * @param {object} params
     * @param {string} params.name
     * @param {string} [params.description]
     * @param {string[]} params.files - Absolute document paths.
     * @returns {Promise<object>} The stored session.
     */
    async create({ name, description, files }) {
        const now     = this.now();
        const session = createSession({ id : generateId(now, this.random), name, description, files, now });
        await this.ensureDirectory();
        await this.writeAtomically(session);
        return session;
    }

    /**
     * Changes a session's name and/or description. Identity, creation time, and files are immutable.
     * @param {string} id
     * @param {{ name?: string, description?: string }} changes
     * @returns {Promise<object>} The updated session.
     */
    async update(id, changes) {
        const session = await this.get(id);
        const updated = { ...session, updatedAt : this.now().toISOString() };
        if (changes.name !== undefined) {
            updated.name = normalizeName(changes.name);
        }
        if (changes.description !== undefined) {
            updated.description = String(changes.description).trim();
        }
        await this.writeAtomically(updated);
        return updated;
    }

    /**
     * Deletes a session file. The session must exist and be valid, so a mismatched or
     * duplicated file is never deleted through another session's id.
     * @param {string} id
     * @returns {Promise<void>}
     */
    async remove(id) {
        await this.get(id);
        await this.fs.unlink(this.filePathFor(id));
    }

    /**
     * Creates the sessions folder when missing. UXP reports an existing folder as an error.
     * @returns {Promise<void>}
     */
    async ensureDirectory() {
        try {
            await this.fs.mkdir(this.directory, { recursive : true });
        }
        catch (error) {
            if (!isAlreadyExistsError(error)) {
                throw error;
            }
        }
    }

    /**
     * Writes to a temporary file unique to this write, then renames it over the target, so
     * an interrupted write never truncates an existing session and concurrent writers (for
     * example two InDesign instances) never publish each other's partial file.
     * @param {object} session
     * @returns {Promise<void>}
     */
    async writeAtomically(session) {
        const filePath = this.filePathFor(session.id);
        const unique   = `${this.now().getTime().toString(36)}${Math.floor(this.random() * 36 ** 6).toString(36)}`;
        const tempPath = `${filePath}.${unique}.tmp`;
        await this.fs.writeFile(tempPath, serializeSession(session), { encoding : 'utf-8' });
        await this.fs.rename(tempPath, filePath);
    }
}

module.exports = {
    SessionNotFoundError,
    SessionStore,
};
