/**
 * Host-independent in-host checks, run inside InDesign or Photoshop by a thin entry script
 * (verify.idjs / verify.psjs) that supplies a host fixture.
 *
 * Exercises the plugin's real modules against the real host document model and UXP `fs`,
 * using only documents the fixture creates under the run's work folder. Every step catches
 * its own errors and records them in the result file so the host never shows an error dialog.
 *
 * A fixture provides:
 * - `hostName` and `extension` (document file extension, for example `.indd` or `.png`);
 * - `documents`: the plugin's documents adapter for the host;
 * - `createSavedDocument(path)`, `createUntitledDocument()` (returns its name),
 *   `closeDocument(handle)`, and `closeSuiteDocuments(prefix)`.
 */
const { SessionStore }     = require('../../src/sessions/SessionStore.js');
const { SessionWorkflows } = require('../../src/workflows/SessionWorkflows.js');

// macOS reports native paths in decomposed Unicode, so comparisons use NFC.
const samePath     = (left, right) => typeof left === 'string' && typeof right === 'string' && left.normalize('NFC') === right.normalize('NFC');
const isOpen       = (path, openDocuments) => openDocuments.some((document) => samePath(document.path, path));
const includesPath = (paths, path) => paths.some((candidate) => samePath(candidate, path));

/**
 * Runs every check and writes the result file.
 * @param {object} params
 * @param {object} params.fs - UXP `fs`.
 * @param {object} params.platform - The plugin's Platform adapter.
 * @param {{ workDirectory: string, resultPath: string }} params.config - Per-run settings from run.mjs.
 * @param {(tracking: { result: object, writeResult: () => void }) => object} params.createFixture
 * @returns {Promise<void>}
 */
const runSuite = async ({ fs, platform, config, createFixture }) => {
    const kWORK  = config.workDirectory;
    const result = { checks : [], untitledNames : [], documentIds : [], done : false };

    // Persisted after every check so a stalled run still reports progress.
    const writeResult = () => fs.writeFileSync(config.resultPath, JSON.stringify(result, null, 2), { encoding : 'utf-8' });
    const check       = (name, pass, detail) => {
        result.checks.push({ name, pass : Boolean(pass), detail });
        writeResult();
    };
    const step = async (name, action) => {
        try {
            await action();
        }
        catch (error) {
            check(`${name} (unexpected error)`, false, String(error && error.stack ? error.stack : error));
        }
    };

    const fixture   = createFixture({ result, writeResult });
    const ext       = fixture.extension;
    const { documents } = fixture;
    const paths     = {
        catalog : `${kWORK}/docs/Spring Catalog #3/catalog é 100%${ext}`,
        order   : `${kWORK}/docs/Spring Catalog #3/order form${ext}`,
        prices  : `${kWORK}/docs/archive/order form${ext}`,
        missing : `${kWORK}/docs/deleted since saving${ext}`,
    };
    const store     = new SessionStore({ fs, directory : `${kWORK}/sessions`, separator : '/' });
    const workflows = new SessionWorkflows({ store, documents, platform, caseInsensitivePaths : true });
    const opened    = {};
    let session;

    try {
        await step('setup', async () => {
            await fs.mkdir(`${kWORK}/docs/Spring Catalog #3`, { recursive : true });
            await fs.mkdir(`${kWORK}/docs/archive`, { recursive : true });
            await fs.mkdir(`${kWORK}/delivery`, { recursive : true });
            opened.catalog = await fixture.createSavedDocument(paths.catalog);
            opened.order   = await fixture.createSavedDocument(paths.order);
            opened.prices  = await fixture.createSavedDocument(paths.prices);
            result.untitledDocument = await fixture.createUntitledDocument();
            writeResult();
        });

        await step('listOpenDocuments', async () => {
            const openDocuments = await documents.listOpenDocuments();
            const untitled      = openDocuments.find((document) => document.name === result.untitledDocument);
            check('listOpenDocuments returns native paths with spaces, #, %, and é', isOpen(paths.catalog, openDocuments) && isOpen(paths.order, openDocuments), openDocuments);
            check('listOpenDocuments reports the untitled document with a null path', untitled && untitled.path === null, untitled);
        });

        await step('saveOpenDocuments', async () => {
            const saved = await workflows.saveOpenDocuments({ name : 'Host verification "quoted" — café', description : 'Line one\nLine two' });
            session = saved.session;
            const expected = [paths.catalog, paths.order, paths.prices];
            check('saveOpenDocuments stores the saved test documents', expected.every((path) => includesPath(session.files, path)), session.files);
            check('saveOpenDocuments skips the untitled document', saved.untitledCount >= 1 && !session.files.some((path) => !path.startsWith('/')), saved.untitledCount);
            const text = await fs.readFile(store.filePathFor(session.id), { encoding : 'utf-8' });
            check('the session file round-trips through UXP fs as JSON', JSON.parse(text).name === 'Host verification "quoted" — café', text.slice(0, 200));
        });

        await step('update', async () => {
            await store.update(session.id, { name : 'Renamed in host' });
            const reread  = await store.get(session.id);
            const entries = await fs.readdir(`${kWORK}/sessions`);
            check('update replaces the existing session file via UXP fs.rename', reread.name === 'Renamed in host' && !entries.some((name) => name.endsWith('.tmp')), entries);
            const listed = await store.list();
            check('list returns the session newest-first with no invalid files', listed.sessions.length === 1 && listed.invalidFiles.length === 0, listed.invalidFiles);
        });

        await step('openSession', async () => {
            // Session with the three test documents plus one path that no longer exists.
            const reopen = await store.create({ name : 'Reopen', files : [paths.catalog, paths.order, paths.prices, paths.missing] });
            await fixture.closeDocument(opened.catalog);
            await fixture.closeDocument(opened.order);
            const openResult = await workflows.openSession(reopen.id);
            check('openSession opens closed documents by raw native path', openResult.opened.length === 2 && includesPath(openResult.opened, paths.catalog) && includesPath(openResult.opened, paths.order), openResult);
            check('openSession reports the still-open document as already open', openResult.alreadyOpen.length === 1 && samePath(openResult.alreadyOpen[0], paths.prices), openResult.alreadyOpen);
            check('openSession reports the deleted document as missing', openResult.missing.length === 1 && samePath(openResult.missing[0], paths.missing), openResult.missing);
            const openDocuments = await documents.listOpenDocuments();
            check(`the reopened documents are open in ${fixture.hostName}`, isOpen(paths.catalog, openDocuments) && isOpen(paths.order, openDocuments), openDocuments.map((document) => document.path));
        });

        await step('copySessionDocuments', async () => {
            const existing = `${kWORK}/delivery/order form${ext}`;
            fs.writeFileSync(existing, 'pre-existing delivery file', { encoding : 'utf-8' });
            const copyResult = await workflows.copySessionDocuments(session.id, `${kWORK}/delivery`);
            // The session also holds any documents the user had open; only the suite's copies are checked.
            const ours      = copyResult.copied.filter((copy) => copy.source.startsWith(kWORK)).map((copy) => copy.target.slice(`${kWORK}/delivery/`.length).normalize('NFC')).sort();
            const untouched = await fs.readFile(existing, { encoding : 'utf-8' });
            const expected  = [`catalog é 100%${ext}`.normalize('NFC'), `order form (2)${ext}`, `order form (3)${ext}`].sort();
            check('copy never overwrites and suffixes collisions within the batch', untouched === 'pre-existing delivery file'
                && JSON.stringify(ours) === JSON.stringify(expected), { ours, copied : copyResult.copied });
        });

        await step('collectOpenDocuments', async () => {
            await fs.mkdir(`${kWORK}/collect`, { recursive : true });
            const collectResult = await workflows.collectOpenDocuments(`${kWORK}/collect`);
            const ours          = collectResult.copied.filter((copy) => copy.source.startsWith(kWORK));
            check('collect copies the open test documents and counts the untitled one', ours.length === 3 && collectResult.untitledCount >= 1, collectResult);
        });

        await step('missing session', async () => {
            try {
                await store.get('20261108-000000-zzzz');
                check('get of a missing session throws SessionNotFoundError', false, 'no error');
            }
            catch (error) {
                check('get of a missing session throws SessionNotFoundError', error.name === 'SessionNotFoundError', error.name);
            }
        });

        await step('exclusive writes', async () => {
            const target = `${kWORK}/delivery/exclusive.txt`;
            fs.writeFileSync(target, 'kept', { encoding : 'utf-8' });
            let copyError = null;
            try {
                await platform.copyFile(paths.catalog, target);
            }
            catch (error) {
                copyError = error;
            }
            const kept = await fs.readFile(target, { encoding : 'utf-8' });
            check('Platform.copyFile refuses to replace an existing file', copyError !== null && kept === 'kept', { code : copyError && copyError.code, kept });

            // Fixed clock and randomness so every attempt produces the same id.
            const fixedNow = new Date();
            const stuck    = new SessionStore({ fs, directory : `${kWORK}/sessions-collide`, separator : '/', now : () => fixedNow, random : () => 0.5 });
            const original = await stuck.create({ name : 'First', files : [paths.catalog] });
            let createError = null;
            try {
                await stuck.create({ name : 'Same id every time', files : [paths.catalog] });
            }
            catch (error) {
                createError = error;
            }
            const reread = await stuck.get(original.id);
            check('SessionStore.create never replaces a session with the same id', createError !== null && reread.name === 'First', { error : String(createError), name : reread.name });
        });

        await step('remove', async () => {
            const doomed = await store.create({ name : 'Delete me', files : [paths.catalog] });
            await store.remove(doomed.id);
            const entries = await fs.readdir(`${kWORK}/sessions`);
            check('remove deletes the session file via UXP fs.unlink', !entries.includes(`${doomed.id}.json`) && entries.length > 0, entries);
        });
    }
    catch (error) {
        check('verification script', false, String(error));
    }
    finally {
        await step('cleanup', () => fixture.closeSuiteDocuments(kWORK));
        result.done = true;
        writeResult();
    }
};

module.exports = {
    runSuite,
};
