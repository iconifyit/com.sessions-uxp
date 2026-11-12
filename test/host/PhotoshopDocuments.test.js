const { PhotoshopDocuments }           = require('../../src/host/PhotoshopDocuments.js');
const { fakePhotoshop, fakePsDocument } = require('../support/fakePhotoshop.js');

const kSHOOT = '/Users/scott/Dropbox/clients/café/Spring Shoot #3';
const kHERO  = `${kSHOOT}/hero 100%.psd`;
const kBADGE = `${kSHOOT}/badge.png`;

describe('PhotoshopDocuments.listOpenDocuments', () => {
    test('returns native paths for documents on disk and null for untitled, cloud, and non-file documents', async () => {
        // Scenario: a saved PSD with edits, a clean PNG, a new untitled canvas, a cloud document, and an identifier without the cloud flag.
        const { app, core, localFileSystem } = fakePhotoshop({ documents : [
            fakePsDocument({ name : 'hero 100%.psd', path : kHERO, saved : false }),
            fakePsDocument({ name : 'badge.png', path : kBADGE }),
            fakePsDocument({ name : 'Untitled-1', path : '' }),
            fakePsDocument({ name : 'Moodboard', path : 'urn:aaid:sc:US:5b2a9c1e', cloudDocument : true }),
            fakePsDocument({ name : 'Shared Board', path : 'urn:aaid:sc:US:77f0' }),
        ] });

        expect(await new PhotoshopDocuments({ app, core, localFileSystem }).listOpenDocuments()).toEqual([
            { name : 'hero 100%.psd', path : kHERO, modified : true },
            { name : 'badge.png', path : kBADGE, modified : false },
            { name : 'Untitled-1', path : null, modified : false },
            { name : 'Moodboard', path : null, modified : false },
            { name : 'Shared Board', path : null, modified : false },
        ]);
    });
});

describe('PhotoshopDocuments.openDocument', () => {
    test('opens a file entry for the raw native path inside an interactive modal scope', async () => {
        // Scenario: reopening a PSD whose path has spaces, #, %, and é.
        const { app, core, localFileSystem } = fakePhotoshop({ existingPaths : [kHERO] });

        await expect(new PhotoshopDocuments({ app, core, localFileSystem }).openDocument(kHERO)).resolves.toEqual({ name : 'hero 100%.psd' });
        expect(app.openedPaths).toEqual([kHERO]);
        expect(core.modalOptions).toEqual([{ commandName : 'Open Session Document', interactive : true }]);
    });

    test('rejects when the file no longer exists', async () => {
        // Scenario: the PNG was deleted after the session was saved.
        const { app, core, localFileSystem } = fakePhotoshop({ existingPaths : [] });
        await expect(new PhotoshopDocuments({ app, core, localFileSystem }).openDocument(kBADGE)).rejects.toThrow('Could not find an entry');
    });

    test('rejects when Photoshop cannot open the file', async () => {
        // Scenario: a damaged PSD.
        const { app, core, localFileSystem } = fakePhotoshop({
            existingPaths : [kHERO],
            onOpen        : () => { throw new Error('The document with an id of undefined does not exist.'); },
        });
        await expect(new PhotoshopDocuments({ app, core, localFileSystem }).openDocument(kHERO)).rejects.toThrow('does not exist');
    });

    test('rejects with "not opened" when the open ends without a document', async () => {
        // Scenario: the user cancels Photoshop's color-profile prompt.
        const { app, core, localFileSystem } = fakePhotoshop({ existingPaths : [kHERO], onOpen : () => undefined });
        await expect(new PhotoshopDocuments({ app, core, localFileSystem }).openDocument(kHERO)).rejects.toThrow('not opened');
        expect(app.openedPaths).toEqual([]);
    });
});
