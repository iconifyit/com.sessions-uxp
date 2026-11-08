const {
    InvalidSessionError,
    createSession,
    defaultSessionName,
    generateId,
    isAbsolutePath,
    parseSession,
    serializeSession,
    sortNewestFirst,
} = require('../../src/sessions/session.js');

const kNOW     = new Date('2026-11-08T14:32:05.120Z');
const kID      = '20261108-143205-k3f9';
const kFILES   = [
    '/Users/scott/Dropbox/clients/acme/spring-catalog/catalog-2027.indd',
    '/Users/scott/Dropbox/clients/acme/spring-catalog/order form (rev 2).indd',
];

/**
 * Builds a stored session object for parse tests.
 * @param {object} overrides
 * @returns {object}
 */
const storedSession = (overrides = {}) => ({
    schemaVersion : 1,
    id            : kID,
    name          : '2026-11-08 14:32',
    description   : 'Spring catalog layout pass',
    createdAt     : '2026-11-08T14:32:05.120Z',
    updatedAt     : '2026-11-08T14:32:05.120Z',
    files         : kFILES,
    ...overrides,
});

describe('generateId', () => {
    test('encodes the UTC creation time followed by a four-character suffix', () => {
        // Scenario: a session created at a fixed UTC instant with a deterministic random source.
        const values = [0.0, 0.5, 0.99, 0.28];
        const id     = generateId(kNOW, () => values.shift());
        expect(id).toBe('20261108-143205-as9k');
    });

    test('always produces ids that parse as valid session ids', () => {
        // Scenario: ids generated across random draws must satisfy the id format used for file names.
        for (let i = 0; i < 50; i++) {
            const id = generateId(kNOW);
            expect(() => parseSession(JSON.stringify(storedSession({ id })), id)).not.toThrow();
        }
    });
});

describe('defaultSessionName', () => {
    test('uses local date and time to the minute', () => {
        // Scenario: the default name shown in the Save dialog.
        const localNoon = new Date(2026, 10, 8, 9, 5, 59);
        expect(defaultSessionName(localNoon)).toBe('2026-11-08 09:05');
    });
});

describe('isAbsolutePath', () => {
    test.each([
        ['/Users/scott/Dropbox/catalog.indd', true],
        ['C:\\Users\\scott\\catalog.indd', true],
        ['D:/Projects/catalog.indd', true],
        ['\\\\fileserver\\share\\catalog.indd', true],
        ['catalog.indd', false],
        ['./catalog.indd', false],
        ['', false],
        [42, false],
    ])('%p -> %p', (path, expected) => {
        // Scenario: session files must only contain absolute document paths.
        expect(isAbsolutePath(path)).toBe(expected);
    });
});

describe('createSession', () => {
    test('builds a record with schema version, trimmed text, and matching timestamps', () => {
        // Scenario: saving a session with padded user input.
        const session = createSession({ id : kID, name : '  Spring catalog  ', description : ' layout pass ', files : kFILES, now : kNOW });
        expect(session).toEqual({
            schemaVersion : 1,
            id            : kID,
            name          : 'Spring catalog',
            description   : 'layout pass',
            createdAt     : '2026-11-08T14:32:05.120Z',
            updatedAt     : '2026-11-08T14:32:05.120Z',
            files         : kFILES,
        });
    });

    test('rejects a blank name', () => {
        // Scenario: the user clears the name field.
        expect(() => createSession({ id : kID, name : '   ', files : kFILES, now : kNOW })).toThrow(InvalidSessionError);
    });

    test('rejects relative document paths', () => {
        // Scenario: a caller passes a path that cannot be reopened reliably.
        expect(() => createSession({ id : kID, name : 'Spring', files : ['catalog.indd'], now : kNOW })).toThrow(InvalidSessionError);
    });
});

describe('parseSession / serializeSession', () => {
    test('round-trips quotes, newlines, and Unicode without corruption', () => {
        // Scenario: the CEP defect where a quote in the description corrupted the session file.
        const session = createSession({
            id          : kID,
            name        : 'Café "Le Marché" — spring',
            description : 'Client said: "keep it calm"\nSecond line ✓',
            files       : ['/Users/scott/Dropbox/clients/café/menü #3 100%.indd'],
            now         : kNOW,
        });
        expect(parseSession(serializeSession(session), kID)).toEqual(session);
    });

    test.each([
        ['not JSON', '{ "schemaVersion": 1,', /Not valid JSON/],
        ['an array', '[]', /JSON object/],
        ['an unknown schema version', JSON.stringify(storedSession({ schemaVersion : 2 })), /schemaVersion/],
        ['a malformed id', JSON.stringify(storedSession({ id : '../../Documents/notes' })), /Invalid session id/],
        ['an empty name', JSON.stringify(storedSession({ name : '  ' })), /name/],
        ['a non-ISO createdAt', JSON.stringify(storedSession({ createdAt : 'yesterday' })), /createdAt/],
        ['an impossible createdAt', JSON.stringify(storedSession({ createdAt : '2026-13-45T99:99:99Z' })), /createdAt/],
        ['a non-ISO updatedAt', JSON.stringify(storedSession({ updatedAt : 1793370725120 })), /updatedAt/],
        ['a relative file path', JSON.stringify(storedSession({ files : ['catalog.indd'] })), /absolute/],
        ['an empty file path', JSON.stringify(storedSession({ files : [''] })), /absolute/],
        ['files that is not an array', JSON.stringify(storedSession({ files : '/Users/scott/a.indd' })), /absolute/],
        ['a non-string description', JSON.stringify(storedSession({ description : 7 })), /description/],
    ])('rejects %s', (_label, text, reason) => {
        // Scenario: hand-edited or damaged session files are reported as invalid.
        expect(() => parseSession(text, kID)).toThrow(reason);
    });

    test('rejects a file whose stored id differs from its file name', () => {
        // Scenario: a user duplicates 20261108-143205-k3f9.json as 20261109-090000-abcd.json.
        expect(() => parseSession(JSON.stringify(storedSession()), '20261109-090000-abcd')).toThrow(/does not match its file name/);
    });
});

describe('sortNewestFirst', () => {
    test('orders by creation time regardless of name, without mutating the input', () => {
        // Scenario: a renamed older session must not jump above newer ones (CEP sorted by file name).
        const older  = storedSession({ id : '20261101-080000-aaaa', name : 'Zebra campaign', createdAt : '2026-11-01T08:00:00.000Z' });
        const newest = storedSession({ id : '20261108-143205-k3f9', name : 'Annual report', createdAt : '2026-11-08T14:32:05.120Z' });
        const middle = storedSession({ id : '20261105-120000-bbbb', name : 'Menu', createdAt : '2026-11-05T12:00:00.000Z' });
        const input  = [older, newest, middle];
        expect(sortNewestFirst(input).map((s) => s.id)).toEqual([newest.id, middle.id, older.id]);
        expect(input.map((s) => s.id)).toEqual([older.id, newest.id, middle.id]);
    });
});
