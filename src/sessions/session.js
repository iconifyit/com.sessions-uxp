/**
 * The session record: creation, identity, validation, serialization, and ordering.
 *
 * Pure functions only; persistence lives in SessionStore. See ADR-001 §3 for the format.
 */

const { isAbsolutePath } = require('../shared/paths.js');

const kSCHEMA_VERSION = 1;
const kID_PATTERN     = /^\d{8}-\d{6}-[a-z0-9]{4}$/;
const kID_ALPHABET    = 'abcdefghijklmnopqrstuvwxyz0123456789';
const kISO_8601       = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Raised when a stored session does not satisfy the session format.
 */
class InvalidSessionError extends Error {
    /**
     * @param {string} reason - Human-readable explanation of the violation.
     */
    constructor(reason) {
        super(reason);
        this.name = 'InvalidSessionError';
    }
}

/**
 * Left-pads a number to two digits.
 * @param {number} value
 * @returns {string}
 */
const pad2 = (value) => String(value).padStart(2, '0');

/**
 * Generates an immutable session id from the UTC creation time plus a random suffix.
 * @param {Date} now - Creation time.
 * @param {() => number} [random=Math.random] - Source of randomness in [0, 1).
 * @returns {string} Id such as `20261108-143205-k3f9`.
 */
const generateId = (now, random = Math.random) => {
    const date = `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}`;
    const time = `${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}`;
    let suffix = '';
    for (let i = 0; i < 4; i++) {
        suffix += kID_ALPHABET[Math.floor(random() * kID_ALPHABET.length)];
    }
    return `${date}-${time}-${suffix}`;
};

/**
 * Returns true when the value is a well-formed session id.
 * @param {*} id
 * @returns {boolean}
 */
const isValidId = (id) => typeof id === 'string' && kID_PATTERN.test(id);

/**
 * Default display name for a new session: the local creation date and time.
 * @param {Date} now
 * @returns {string} For example `2026-11-08 14:32`.
 */
const defaultSessionName = (now) => {
    const date = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    return `${date} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
};

/**
 * Returns true when the value is an ISO 8601 timestamp that parses to a real date.
 * @param {*} value
 * @returns {boolean}
 */
const isIsoTimestamp = (value) => typeof value === 'string'
    && kISO_8601.test(value)
    && !Number.isNaN(Date.parse(value));

/**
 * Normalizes a user-entered name: trims whitespace; empty names are rejected.
 * @param {*} name
 * @returns {string}
 * @throws {InvalidSessionError} When the trimmed name is empty or not a string.
 */
const normalizeName = (name) => {
    if (typeof name !== 'string' || name.trim() === '') {
        throw new InvalidSessionError('Session name must not be empty.');
    }
    return name.trim();
};

/**
 * Builds a new session record.
 * @param {object} params
 * @param {string} params.id - Id from generateId.
 * @param {string} params.name - Display name.
 * @param {string} [params.description=''] - Optional description.
 * @param {string[]} params.files - Absolute document paths.
 * @param {Date} params.now - Creation time.
 * @returns {object} Session record.
 * @throws {InvalidSessionError} When any field is invalid.
 */
const createSession = ({ id, name, description = '', files, now }) => {
    const timestamp = now.toISOString();
    const session = {
        schemaVersion : kSCHEMA_VERSION,
        id,
        name          : normalizeName(name),
        description   : typeof description === 'string' ? description.trim() : '',
        createdAt     : timestamp,
        updatedAt     : timestamp,
        files         : [...files],
    };
    validateSession(session, id);
    return session;
};

/**
 * Validates a session record against the format and its expected id.
 * @param {*} session - Candidate record.
 * @param {string} expectedId - The id the record must carry (the filename stem when read from disk).
 * @returns {void}
 * @throws {InvalidSessionError} On the first violation found.
 */
const validateSession = (session, expectedId) => {
    if (session === null || typeof session !== 'object' || Array.isArray(session)) {
        throw new InvalidSessionError('Session must be a JSON object.');
    }
    if (session.schemaVersion !== kSCHEMA_VERSION) {
        throw new InvalidSessionError(`Unsupported schemaVersion: ${JSON.stringify(session.schemaVersion)}.`);
    }
    if (!isValidId(session.id)) {
        throw new InvalidSessionError(`Invalid session id: ${JSON.stringify(session.id)}.`);
    }
    if (session.id !== expectedId) {
        throw new InvalidSessionError(`Session id ${session.id} does not match its file name ${expectedId}.json.`);
    }
    if (typeof session.name !== 'string' || session.name.trim() === '') {
        throw new InvalidSessionError('Session name must be a non-empty string.');
    }
    if (session.description !== undefined && typeof session.description !== 'string') {
        throw new InvalidSessionError('Session description must be a string.');
    }
    if (!isIsoTimestamp(session.createdAt)) {
        throw new InvalidSessionError('createdAt must be an ISO 8601 timestamp.');
    }
    if (session.updatedAt !== undefined && !isIsoTimestamp(session.updatedAt)) {
        throw new InvalidSessionError('updatedAt must be an ISO 8601 timestamp.');
    }
    if (!Array.isArray(session.files) || !session.files.every(isAbsolutePath)) {
        throw new InvalidSessionError('files must be an array of absolute paths.');
    }
};

/**
 * Parses and validates stored session text.
 * @param {string} text - File contents.
 * @param {string} fileStem - File name without `.json`; must equal the stored id.
 * @returns {object} Session record.
 * @throws {InvalidSessionError} When the text is not valid JSON or violates the format.
 */
const parseSession = (text, fileStem) => {
    let session;
    try {
        session = JSON.parse(text);
    }
    catch (error) {
        throw new InvalidSessionError(`Not valid JSON: ${error.message}`);
    }
    validateSession(session, fileStem);
    return session;
};

/**
 * Serializes a session for storage.
 * @param {object} session
 * @returns {string} Pretty-printed JSON with a trailing newline.
 */
const serializeSession = (session) => `${JSON.stringify(session, null, 2)}\n`;

/**
 * Returns a new array of sessions ordered newest-first by creation time.
 * Ties are broken by id so the order is stable and deterministic.
 * @param {object[]} sessions
 * @returns {object[]}
 */
const sortNewestFirst = (sessions) => [...sessions].sort((a, b) => {
    const byCreated = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (byCreated !== 0) {
        return byCreated;
    }
    return b.id.localeCompare(a.id);
});

module.exports = {
    InvalidSessionError,
    createSession,
    defaultSessionName,
    generateId,
    isValidId,
    normalizeName,
    parseSession,
    serializeSession,
    sortNewestFirst,
    validateSession,
};
