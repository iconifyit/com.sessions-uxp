const { SessionWorkflows }      = require('../../src/workflows/SessionWorkflows.js');
const { InDesignDocuments }     = require('../../src/host/InDesignDocuments.js');
const { fakeApp, fakeDocument } = require('../support/fakeInDesign.js');

const kCLIENT   = '/Users/scott/Dropbox/clients/acme/spring-catalog';
const kCATALOG  = `${kCLIENT}/catalog-2027.indd`;
const kORDER    = `${kCLIENT}/order-form.indd`;
const kPRICES   = `${kCLIENT}/price list #2.indd`;
const kARCHIVE  = '/Users/scott/Dropbox/clients/acme/archive-2026/catalog-2027.indd';
const kDELIVERY = '/Users/scott/Desktop/Acme delivery';

/**
 * In-memory SessionStore stand-in recording created sessions.
 * @param {object[]} [sessions]
 * @returns {object}
 */
const fakeStore = (sessions = []) => ({
    sessions : [...sessions],
    create   : jest.fn(async function create({ name, description, files }) {
        const session = { id : '20261108-143205-k3f9', name, description, files };
        this.sessions.push(session);
        return session;
    }),
    get : jest.fn(async function get(id) {
        return this.sessions.find((session) => session.id === id);
    }),
});

/**
 * In-memory Platform stand-in over a set of existing paths; copies add their target.
 * @param {string[]} existingPaths
 * @returns {object}
 */
const fakePlatform = (existingPaths) => {
    const existing = new Set(existingPaths);
    return {
        copies     : [],
        fileExists : jest.fn(async (path) => existing.has(path)),
        copyFile   : jest.fn(async function copyFile(source, target) {
            if (existing.has(target)) {
                throw new Error(`test guard: ${target} would be overwritten`);
            }
            existing.add(target);
            this.copies.push({ source, target });
        }),
    };
};

/**
 * Wires workflows over a fake InDesign with the given open documents.
 * @param {object} params
 * @returns {{ workflows: SessionWorkflows, app: object, store: object, platform: object }}
 */
const setup = ({ openDocuments = [], sessions = [], existingPaths = [], onOpen } = {}) => {
    const app       = fakeApp({ documents : openDocuments, onOpen });
    const store     = fakeStore(sessions);
    const platform  = fakePlatform(existingPaths);
    const workflows = new SessionWorkflows({ store, documents : new InDesignDocuments({ app }), platform, caseInsensitivePaths : true });
    return { workflows, app, store, platform };
};

describe('SessionWorkflows.saveOpenDocuments', () => {
    test('saves saved documents in InDesign order and reports skipped untitled documents', async () => {
        // Scenario: two saved documents (one with unsaved edits) and one untitled document are open.
        const { workflows, store } = setup({ openDocuments : [
            fakeDocument({ name : 'order-form.indd', path : kORDER, modified : true }),
            fakeDocument({ name : 'Untitled-1', path : null }),
            fakeDocument({ name : 'catalog-2027.indd', path : kCATALOG }),
        ] });

        const result = await workflows.saveOpenDocuments({ name : 'Spring catalog', description : 'Layout pass' });

        expect(store.create).toHaveBeenCalledWith({ name : 'Spring catalog', description : 'Layout pass', files : [kORDER, kCATALOG] });
        expect(result.untitledCount).toBe(1);
        expect(result.session.files).toEqual([kORDER, kCATALOG]);
    });

    test('creates nothing when every open document is untitled', async () => {
        // Scenario: only never-saved documents are open.
        const { workflows, store } = setup({ openDocuments : [
            fakeDocument({ name : 'Untitled-1', path : null }),
            fakeDocument({ name : 'Untitled-2', path : null }),
        ] });

        await expect(workflows.saveOpenDocuments({ name : 'Spring catalog' })).resolves.toEqual({ session : null, untitledCount : 2 });
        expect(store.create).not.toHaveBeenCalled();
    });

    test('inspectOpenDocuments counts untitled and modified documents', async () => {
        // Scenario: the Save dialog notes unsaved changes before saving.
        const { workflows } = setup({ openDocuments : [
            fakeDocument({ name : 'order-form.indd', path : kORDER, modified : true }),
            fakeDocument({ name : 'Untitled-1', path : null, modified : true }),
            fakeDocument({ name : 'catalog-2027.indd', path : kCATALOG }),
        ] });

        await expect(workflows.inspectOpenDocuments()).resolves.toEqual({ savablePaths : [kORDER, kCATALOG], untitledCount : 1, modifiedCount : 1 });
    });
});

describe('SessionWorkflows.openSession', () => {
    test('opens available documents and reports already open, missing, and failed ones', async () => {
        // Scenario: a four-document session where one is open, one was deleted, and one is damaged.
        const session = { id : '20261108-143205-k3f9', files : [kCATALOG, kORDER, kPRICES, kARCHIVE] };
        const { workflows, app } = setup({
            openDocuments : [fakeDocument({ name : 'Catalog-2027.INDD', path : '/Users/Scott/Dropbox/clients/acme/spring-catalog/Catalog-2027.INDD' })],
            sessions      : [session],
            existingPaths : [kCATALOG, kORDER, kARCHIVE],
            onOpen        : (path) => {
                if (path === kARCHIVE) {
                    throw new Error('Cannot open the file. It may be damaged.');
                }
            },
        });

        const result = await workflows.openSession(session.id);

        expect(result).toEqual({
            opened      : [kORDER],
            alreadyOpen : [kCATALOG],
            missing     : [kPRICES],
            failed      : [{ path : kARCHIVE, reason : 'Cannot open the file. It may be damaged.' }],
        });
        expect(app.openedPaths).toEqual([kORDER]);
    });

    test('opens a document listed twice only once', async () => {
        // Scenario: a hand-edited session lists the same file with a trailing separator and a .. segment.
        const session = { id : '20261108-143205-k3f9', files : [kORDER, `${kCLIENT}/../spring-catalog/order-form.indd/`] };
        const { workflows, app } = setup({ sessions : [session], existingPaths : [kORDER] });

        const result = await workflows.openSession(session.id);

        expect(app.openedPaths).toEqual([kORDER]);
        expect(result.opened).toEqual([kORDER]);
        expect(result.alreadyOpen).toHaveLength(1);
    });

    test('records an existence-check failure as failed and continues', async () => {
        // Scenario: one document sits on a volume that denies access.
        const session = { id : '20261108-143205-k3f9', files : [kCATALOG, kORDER] };
        const { workflows, platform } = setup({ sessions : [session], existingPaths : [kORDER] });
        platform.fileExists.mockImplementationOnce(async () => { throw new Error('permission denied'); });

        const result = await workflows.openSession(session.id);

        expect(result.failed).toEqual([{ path : kCATALOG, reason : 'permission denied' }]);
        expect(result.opened).toEqual([kORDER]);
    });
});

describe('SessionWorkflows.copySessionDocuments / collectOpenDocuments', () => {
    test('never overwrites, suffixing collisions with existing files and within the batch', async () => {
        // Scenario: two same-named documents from different folders, plus an existing copy in the target folder.
        const session = { id : '20261108-143205-k3f9', files : [kCATALOG, kARCHIVE, kORDER, kPRICES] };
        const { workflows, platform } = setup({
            sessions      : [session],
            existingPaths : [kCATALOG, kARCHIVE, kORDER, `${kDELIVERY}/catalog-2027.indd`],
        });

        const result = await workflows.copySessionDocuments(session.id, kDELIVERY);

        expect(result.copied).toEqual([
            { source : kCATALOG, target : `${kDELIVERY}/catalog-2027 (2).indd` },
            { source : kARCHIVE, target : `${kDELIVERY}/catalog-2027 (3).indd` },
            { source : kORDER, target : `${kDELIVERY}/order-form.indd` },
        ]);
        expect(result.missing).toEqual([kPRICES]);
        expect(result.failed).toEqual([]);
        expect(platform.copies).toHaveLength(3);
    });

    test('collect copies saved open documents and reports untitled and modified counts', async () => {
        // Scenario: Collect Open Documents with an untitled document and unsaved edits open.
        const { workflows } = setup({
            openDocuments : [
                fakeDocument({ name : 'catalog-2027.indd', path : kCATALOG, modified : true }),
                fakeDocument({ name : 'Untitled-4', path : null }),
                fakeDocument({ name : 'order-form.indd', path : kORDER }),
            ],
            existingPaths : [kCATALOG, kORDER],
        });

        const result = await workflows.collectOpenDocuments(kDELIVERY);

        expect(result).toEqual({
            copied        : [
                { source : kCATALOG, target : `${kDELIVERY}/catalog-2027.indd` },
                { source : kORDER, target : `${kDELIVERY}/order-form.indd` },
            ],
            missing       : [],
            failed        : [],
            untitledCount : 1,
            modifiedCount : 1,
        });
    });

    test('same-named files differing only in Unicode composition are treated as a collision', async () => {
        // Scenario: a composed "café.indd" and a decomposed "café.indd" from different folders copied in one batch.
        const composed   = '/Users/scott/Dropbox/clients/a/caf\u00e9.indd';
        const decomposed = '/Users/scott/Dropbox/clients/b/cafe\u0301.indd';
        const session    = { id : '20261108-143205-k3f9', files : [composed, decomposed] };
        const { workflows } = setup({ sessions : [session], existingPaths : [composed, decomposed] });

        const result = await workflows.copySessionDocuments(session.id, kDELIVERY);

        expect(result.copied.map((copy) => copy.target.normalize('NFC'))).toEqual([`${kDELIVERY}/caf\u00e9.indd`, `${kDELIVERY}/caf\u00e9 (2).indd`]);
    });

    test('a copy failure is reported and the remaining files are still copied', async () => {
        // Scenario: the target volume rejects one file.
        const session = { id : '20261108-143205-k3f9', files : [kCATALOG, kORDER] };
        const { workflows, platform } = setup({ sessions : [session], existingPaths : [kCATALOG, kORDER] });
        platform.copyFile.mockImplementationOnce(async () => { throw new Error('no space left on device'); });

        const result = await workflows.copySessionDocuments(session.id, kDELIVERY);

        expect(result.failed).toEqual([{ path : kCATALOG, reason : 'no space left on device' }]);
        expect(result.copied).toEqual([{ source : kORDER, target : `${kDELIVERY}/order-form.indd` }]);
    });
});
