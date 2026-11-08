const fsPromises = require('fs/promises');
const os         = require('os');
const path       = require('path');

const { SessionNotFoundError, SessionStore } = require('../../src/sessions/SessionStore.js');
const { InvalidSessionError }                = require('../../src/sessions/session.js');
const { createNodeFs }                       = require('../support/nodeFs.js');

const kBASE_TIME = Date.parse('2026-11-08T14:32:05.120Z');
const kFILES     = [
    '/Users/scott/Dropbox/clients/acme/spring-catalog/catalog-2027.indd',
    '/Users/scott/Dropbox/clients/acme/spring-catalog/order-form.indd',
];

let workDirectory;
let sessionsDirectory;

/**
 * Creates a store over a real temp folder with a controllable clock.
 * @param {object} [overrides]
 * @returns {{ store: SessionStore, clock: { advance: (ms: number) => void } }}
 */
const createStore = (overrides = {}) => {
    let current = kBASE_TIME;
    const store = new SessionStore({
        fs        : createNodeFs(),
        directory : sessionsDirectory,
        separator : path.sep,
        now       : () => new Date(current),
        ...overrides,
    });
    return { store, clock : { advance : (ms) => { current += ms; } } };
};

const readStored = (id) => fsPromises.readFile(path.join(sessionsDirectory, `${id}.json`), 'utf-8');

beforeEach(async () => {
    workDirectory     = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'sessions-store-'));
    sessionsDirectory = path.join(workDirectory, 'com.atomic', 'com.atomic.indesign-sessions', 'sessions');
});

afterEach(async () => {
    await fsPromises.rm(workDirectory, { recursive : true, force : true });
});

describe('SessionStore', () => {
    test('create stores a session that get and list return', async () => {
        // Scenario: first save on a machine with no sessions folder yet.
        const { store } = createStore();
        const created   = await store.create({ name : 'Spring catalog', description : 'Layout pass', files : kFILES });

        expect(await store.get(created.id)).toEqual(created);
        expect(await store.list()).toEqual({ sessions : [created], invalidFiles : [] });
        expect(created.files).toEqual(kFILES);
        expect(created.createdAt).toBe('2026-11-08T14:32:05.120Z');
    });

    test('list orders sessions newest-first even after the oldest is renamed', async () => {
        // Scenario: three saves over two days, then the oldest is renamed.
        const { store, clock } = createStore();
        const oldest = await store.create({ name : 'Menu', files : kFILES });
        clock.advance(86_400_000);
        const middle = await store.create({ name : 'Brochure', files : kFILES });
        clock.advance(86_400_000);
        const newest = await store.create({ name : 'Annual report', files : kFILES });
        await store.update(oldest.id, { name : 'ZZZ renamed menu' });

        const { sessions } = await store.list();
        expect(sessions.map((s) => s.id)).toEqual([newest.id, middle.id, oldest.id]);
    });

    test('update changes name and description only and refreshes updatedAt', async () => {
        // Scenario: Rename… then Describe… on an existing session.
        const { store, clock } = createStore();
        const created = await store.create({ name : 'Spring catalog', files : kFILES });
        clock.advance(60_000);
        const updated = await store.update(created.id, { name : '  Spring catalog — final  ', description : 'Sent to printer' });

        expect(updated).toEqual({
            ...created,
            name        : 'Spring catalog — final',
            description : 'Sent to printer',
            updatedAt   : '2026-11-08T14:33:05.120Z',
        });
        expect(await store.get(created.id)).toEqual(updated);
    });

    test('update rejects an empty name and leaves the stored file unchanged', async () => {
        // Scenario: the user clears the name in the Rename dialog.
        const { store } = createStore();
        const created   = await store.create({ name : 'Spring catalog', files : kFILES });
        const before    = await readStored(created.id);

        await expect(store.update(created.id, { name : '   ' })).rejects.toThrow(InvalidSessionError);
        expect(await readStored(created.id)).toBe(before);
    });

    test('an interrupted writeFile leaves the existing session byte-identical', async () => {
        // Scenario: the disk fills up while writing the temporary file during a rename.
        const { store: writer } = createStore();
        const created = await writer.create({ name : 'Spring catalog', files : kFILES });
        const before  = await readStored(created.id);

        const failingFs = { ...createNodeFs(), writeFile : async (filePath, data, options) => {
            await fsPromises.writeFile(filePath, data.slice(0, 10), options);
            throw Object.assign(new Error('no space left on device'), { code : 'ENOSPC' });
        } };
        const { store } = createStore({ fs : failingFs });

        await expect(store.update(created.id, { name : 'Renamed' })).rejects.toThrow('no space left on device');
        expect(await readStored(created.id)).toBe(before);
        expect((await createStore().store.list()).sessions).toEqual([created]);
    });

    test('a failed rename leaves the existing session byte-identical and the leftover .tmp is ignored', async () => {
        // Scenario: the rename step fails after the temporary file was fully written.
        const { store: writer } = createStore();
        const created = await writer.create({ name : 'Spring catalog', files : kFILES });
        const before  = await readStored(created.id);

        const failingFs = { ...createNodeFs(), rename : async () => {
            throw Object.assign(new Error('operation not permitted'), { code : 'EPERM' });
        } };
        const { store } = createStore({ fs : failingFs });

        await expect(store.update(created.id, { name : 'Renamed' })).rejects.toThrow('operation not permitted');
        expect(await readStored(created.id)).toBe(before);
        expect(await fsPromises.readdir(sessionsDirectory)).toContain(`${created.id}.json.tmp`);
        expect(await createStore().store.list()).toEqual({ sessions : [created], invalidFiles : [] });
    });

    test('list reports invalid files and never modifies them', async () => {
        // Scenario: the folder holds a damaged file and a duplicated session alongside a good one.
        const { store } = createStore();
        const created   = await store.create({ name : 'Spring catalog', files : kFILES });
        const original  = await readStored(created.id);
        const duplicate = path.join(sessionsDirectory, '20261109-090000-abcd.json');
        const damaged   = path.join(sessionsDirectory, '20261110-100000-wxyz.json');
        await fsPromises.writeFile(duplicate, original, 'utf-8');
        await fsPromises.writeFile(damaged, '{ "schemaVersion": 1, "id": ', 'utf-8');
        await fsPromises.writeFile(path.join(sessionsDirectory, 'notes.txt'), 'not a session', 'utf-8');

        const { sessions, invalidFiles } = await store.list();

        expect(sessions).toEqual([created]);
        expect(invalidFiles.map((f) => f.fileName).sort()).toEqual(['20261109-090000-abcd.json', '20261110-100000-wxyz.json']);
        expect(invalidFiles.find((f) => f.fileName === '20261109-090000-abcd.json').reason).toMatch(/does not match its file name/);
        expect(await fsPromises.readFile(duplicate, 'utf-8')).toBe(original);
        expect(await fsPromises.readFile(damaged, 'utf-8')).toBe('{ "schemaVersion": 1, "id": ');
    });

    test('a duplicated file cannot be updated or removed through its id', async () => {
        // Scenario: Delete on a copy must not remove the original session it was copied from.
        const { store } = createStore();
        const created   = await store.create({ name : 'Spring catalog', files : kFILES });
        const copyId    = '20261109-090000-abcd';
        await fsPromises.copyFile(path.join(sessionsDirectory, `${created.id}.json`), path.join(sessionsDirectory, `${copyId}.json`));

        await expect(store.remove(copyId)).rejects.toThrow(InvalidSessionError);
        await expect(store.update(copyId, { name : 'Renamed' })).rejects.toThrow(InvalidSessionError);
        expect(await store.get(created.id)).toEqual(created);
        expect(await fsPromises.readdir(sessionsDirectory)).toContain(`${copyId}.json`);
    });

    test('filePathFor rejects ids that could address a path outside the sessions folder', () => {
        // Scenario: a hand-edited id attempts path traversal.
        const { store } = createStore();
        expect(() => store.filePathFor('../../Documents/notes')).toThrow(InvalidSessionError);
        expect(() => store.filePathFor('20261108-143205-k3f9/../../x')).toThrow(InvalidSessionError);
        expect(store.filePathFor('20261108-143205-k3f9')).toBe(path.join(sessionsDirectory, '20261108-143205-k3f9.json'));
    });

    test('remove deletes the session file', async () => {
        // Scenario: Delete… confirmed on a session.
        const { store, clock } = createStore();
        const kept    = await store.create({ name : 'Keep me', files : kFILES });
        clock.advance(1000);
        const removed = await store.create({ name : 'Remove me', files : kFILES });

        await store.remove(removed.id);

        expect((await store.list()).sessions).toEqual([kept]);
        await expect(store.get(removed.id)).rejects.toThrow(SessionNotFoundError);
    });

    test('get and remove of a missing session fail with SessionNotFoundError', async () => {
        // Scenario: the session file was deleted outside the panel.
        const { store } = createStore();
        await expect(store.get('20261108-143205-k3f9')).rejects.toThrow(SessionNotFoundError);
        await expect(store.remove('20261108-143205-k3f9')).rejects.toThrow(SessionNotFoundError);
    });

    test('ensureDirectory treats the UXP "already exists" error as success and rethrows others', async () => {
        // Scenario: UXP fs.mkdir({ recursive: true }) fails with code -17 when the folder exists.
        const existsFs = { ...createNodeFs(), mkdir : async () => { throw Object.assign(new Error('file already exists'), { code : -17 }); } };
        await expect(createStore({ fs : existsFs }).store.ensureDirectory()).resolves.toBeUndefined();

        const deniedFs = { ...createNodeFs(), mkdir : async () => { throw Object.assign(new Error('permission denied'), { code : -13 }); } };
        await expect(createStore({ fs : deniedFs }).store.ensureDirectory()).rejects.toThrow('permission denied');
    });
});
