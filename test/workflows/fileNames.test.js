const { baseName, joinPath, pathKey, uniqueTargetName } = require('../../src/workflows/fileNames.js');

describe('uniqueTargetName', () => {
    test.each([
        ['returns the name unchanged when free', 'catalog.indd', [], 'catalog.indd'],
        ['appends (2) before the extension', 'catalog.indd', ['catalog.indd'], 'catalog (2).indd'],
        ['skips every taken counter', 'catalog.indd', ['catalog.indd', 'catalog (2).indd', 'catalog (3).indd'], 'catalog (4).indd'],
        ['keeps inner dots in the stem', 'spring.v2.final.indd', ['spring.v2.final.indd'], 'spring.v2.final (2).indd'],
        ['handles names without an extension', 'README', ['README'], 'README (2)'],
        ['treats a dot-file as having no extension', '.hidden', ['.hidden'], '.hidden (2)'],
        ['does not reinterpret an existing counter in the source name', 'order (2).indd', ['order (2).indd'], 'order (2) (2).indd'],
    ])('%s', async (_label, fileName, taken, expected) => {
        // Scenario: copying into a folder that already holds some of these names.
        await expect(uniqueTargetName(fileName, (candidate) => taken.includes(candidate))).resolves.toBe(expected);
    });

    test('awaits an asynchronous isTaken predicate', async () => {
        // Scenario: availability is checked against the file system.
        const isTaken = async (candidate) => candidate === 'catalog.indd';
        await expect(uniqueTargetName('catalog.indd', isTaken)).resolves.toBe('catalog (2).indd');
    });
});

describe('pathKey', () => {
    test.each([
        ['letter case on a case-insensitive volume', '/Users/Scott/Dropbox/Catalog.INDD', '/users/scott/dropbox/catalog.indd'],
        ['a trailing separator', '/Users/scott/Dropbox/catalog.indd/', '/users/scott/dropbox/catalog.indd'],
        ['a .. segment', '/Users/scott/Dropbox/archive/../catalog.indd', '/users/scott/dropbox/catalog.indd'],
        ['a . segment and doubled separators', '/Users/scott//Dropbox/./catalog.indd', '/users/scott/dropbox/catalog.indd'],
        ['Windows separators', 'C:\\Users\\scott\\catalog.indd', 'c:/users/scott/catalog.indd'],
    ])('treats paths differing by %s as the same file', (_label, left, right) => {
        // Scenario: deciding whether a session document is already open.
        expect(pathKey(left, true)).toBe(pathKey(right, true));
    });

    test('keeps letter case distinct on a case-sensitive volume', () => {
        // Scenario: two different files on a case-sensitive APFS volume.
        expect(pathKey('/Volumes/Work/Catalog.indd', false)).not.toBe(pathKey('/Volumes/Work/catalog.indd', false));
    });
});

describe('baseName / joinPath', () => {
    test('extract the file name from macOS and Windows paths', () => {
        // Scenario: naming the copy of a session document.
        expect(baseName('/Users/scott/Dropbox/clients/café/menü #3 100%.indd')).toBe('menü #3 100%.indd');
        expect(baseName('C:\\Users\\scott\\Dropbox\\catalog.indd')).toBe('catalog.indd');
    });

    test('join using the folder separator without doubling it', () => {
        // Scenario: building the copy target inside the folder the user picked.
        expect(joinPath('/Users/scott/Desktop/Delivery', 'catalog.indd')).toBe('/Users/scott/Desktop/Delivery/catalog.indd');
        expect(joinPath('/Users/scott/Desktop/Delivery/', 'catalog.indd')).toBe('/Users/scott/Desktop/Delivery/catalog.indd');
        expect(joinPath('C:\\Users\\scott\\Delivery', 'catalog.indd')).toBe('C:\\Users\\scott\\Delivery\\catalog.indd');
    });
});
