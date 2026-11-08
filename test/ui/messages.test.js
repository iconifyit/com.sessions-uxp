const {
    describeCopyResult,
    describeInvalidFiles,
    describeOpenResult,
    describeSaveResult,
    describeSessionMeta,
} = require('../../src/ui/messages.js');

const kCLIENT  = '/Users/scott/Dropbox/clients/acme/spring-catalog';
const kCATALOG = `${kCLIENT}/catalog-2027.indd`;
const kORDER   = `${kCLIENT}/order-form.indd`;
const kPRICES  = `${kCLIENT}/price list #2.indd`;

describe('describeSaveResult', () => {
    test('reports the saved count and skipped untitled documents', () => {
        // Scenario: two documents saved, one untitled skipped.
        expect(describeSaveResult({ session : { name : 'Spring catalog', files : [kCATALOG, kORDER] }, untitledCount : 1 })).toEqual({
            tone : 'success',
            text : 'Saved "Spring catalog" with 2 documents. Skipped 1 untitled document.',
        });
    });

    test('uses singular wording and omits the skip clause when nothing was skipped', () => {
        // Scenario: a one-document session.
        expect(describeSaveResult({ session : { name : 'Menu', files : [kCATALOG] }, untitledCount : 0 }).text).toBe('Saved "Menu" with 1 document.');
    });

    test('warns when nothing could be saved', () => {
        // Scenario: only untitled documents are open.
        expect(describeSaveResult({ session : null, untitledCount : 2 }).tone).toBe('warning');
    });
});

describe('describeOpenResult', () => {
    test('is a success when every document opened or was already open', () => {
        // Scenario: reopening a session with one document still open.
        expect(describeOpenResult({ opened : [kCATALOG, kORDER], alreadyOpen : [kPRICES], missing : [], failed : [] })).toEqual({
            tone : 'success',
            text : 'Opened 2 documents. 1 document already open.',
        });
    });

    test('names missing and failed documents and warns', () => {
        // Scenario: one document was deleted and one is damaged.
        expect(describeOpenResult({ opened : [kCATALOG], alreadyOpen : [], missing : [kPRICES], failed : [{ path : kORDER, reason : 'damaged' }] })).toEqual({
            tone : 'warning',
            text : 'Opened 1 document. Missing: price list #2.indd. Could not open: order-form.indd.',
        });
    });
});

describe('describeCopyResult', () => {
    test('reports copies, unsaved changes, skipped untitled documents, and missing files', () => {
        // Scenario: Collect Open Documents with mixed document states.
        expect(describeCopyResult({
            copied        : [{ source : kCATALOG, target : '/Users/scott/Desktop/Delivery/catalog-2027.indd' }],
            missing       : [kPRICES],
            failed        : [],
            untitledCount : 1,
            modifiedCount : 1,
        })).toEqual({
            tone : 'warning',
            text : 'Copied 1 document. 1 document with unsaved changes copied as last saved. Skipped 1 untitled document. Missing: price list #2.indd.',
        });
    });

    test('is a success when everything copied', () => {
        // Scenario: Copy Files on a session whose documents all exist.
        expect(describeCopyResult({ copied : [{}, {}], missing : [], failed : [] })).toEqual({ tone : 'success', text : 'Copied 2 documents.' });
    });
});

describe('describeInvalidFiles', () => {
    test('is null when every file was valid', () => {
        // Scenario: a clean sessions folder.
        expect(describeInvalidFiles([])).toBeNull();
    });

    test('lists unreadable files by name', () => {
        // Scenario: a damaged and a duplicated session file.
        expect(describeInvalidFiles([{ fileName : '20261109-090000-abcd.json' }, { fileName : '20261110-100000-wxyz.json' }]).text)
            .toBe('Ignored 2 unreadable session files: 20261109-090000-abcd.json, 20261110-100000-wxyz.json.');
    });
});

describe('describeSessionMeta', () => {
    test('combines document count with the formatted creation date', () => {
        // Scenario: the second line of a session row.
        const formatDate = (date) => date.toISOString().slice(0, 10);
        expect(describeSessionMeta({ files : [kCATALOG, kORDER, kPRICES], createdAt : '2026-11-08T14:32:05.120Z' }, formatDate)).toBe('3 documents · 2026-11-08');
    });
});
