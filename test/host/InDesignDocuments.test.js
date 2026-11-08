const { InDesignDocuments }      = require('../../src/host/InDesignDocuments.js');
const { fakeApp, fakeDocument } = require('../support/fakeInDesign.js');

const kCATALOG = '/Users/scott/Dropbox/clients/café/Spring Catalog #3/catalog 100%.indd';
const kORDER   = '/Users/scott/Dropbox/clients/café/Spring Catalog #3/order-form.indd';

describe('InDesignDocuments.listOpenDocuments', () => {
    test('returns native paths for saved documents and null for untitled ones', async () => {
        // Scenario: two saved documents (one with unsaved edits) and one never-saved document are open.
        const app = fakeApp({ documents : [
            fakeDocument({ name : 'catalog 100%.indd', path : kCATALOG, modified : true }),
            fakeDocument({ name : 'Untitled-2', path : null }),
            fakeDocument({ name : 'order-form.indd', path : kORDER }),
        ] });

        expect(await new InDesignDocuments({ app }).listOpenDocuments()).toEqual([
            { name : 'catalog 100%.indd', path : kCATALOG, modified : true },
            { name : 'Untitled-2', path : null, modified : false },
            { name : 'order-form.indd', path : kORDER, modified : false },
        ]);
    });

    test('treats a fullName without a native path as untitled', async () => {
        // Scenario: a converted document whose file entry resolves without a usable path.
        const converted = { name : 'Legacy Brochure', modified : false, fullName : Promise.resolve({ nativePath : '' }) };
        const app       = fakeApp({ documents : [converted] });

        expect(await new InDesignDocuments({ app }).listOpenDocuments()).toEqual([
            { name : 'Legacy Brochure', path : null, modified : false },
        ]);
    });
});

describe('InDesignDocuments.openDocument', () => {
    test('passes the raw native path to app.open without encoding it', () => {
        // Scenario: a path with spaces, #, %, and non-ASCII characters (UXP encodes file URLs itself).
        const app = fakeApp();
        expect(new InDesignDocuments({ app }).openDocument(kCATALOG)).toEqual({ name : 'catalog 100%.indd' });
        expect(app.openedPaths).toEqual([kCATALOG]);
    });

    test('propagates errors raised by InDesign', () => {
        // Scenario: InDesign cannot open a damaged file.
        const app = fakeApp({ onOpen : () => { throw new Error('Cannot open the file. It may be damaged.'); } });
        expect(() => new InDesignDocuments({ app }).openDocument(kCATALOG)).toThrow('It may be damaged');
    });
});
