const fs   = require('fs');
const path = require('path');

const { HOSTS } = require('../src/hosts.js');

const kROOT    = path.resolve(__dirname, '..');
const pkg      = JSON.parse(fs.readFileSync(path.join(kROOT, 'package.json'), 'utf-8'));
const version  = fs.readFileSync(path.join(kROOT, 'VERSION'), 'utf-8').trim();
const readManifest = (host) => JSON.parse(fs.readFileSync(path.join(kROOT, 'hosts', host, 'manifest.json'), 'utf-8'));

const kMANIFESTS = {
    indesign  : readManifest('indesign'),
    photoshop : readManifest('photoshop'),
};

/**
 * Expands a manifest icon entry into the files UXP loads for each scale (`name@1x.png`, `name@2x.png`).
 * @param {{ path: string, scale: number[] }} icon
 * @returns {string[]}
 */
const iconFiles = (icon) => icon.scale.map((scale) => icon.path.replace(/\.png$/, `@${scale}x.png`));

describe('host manifests', () => {
    test.each([
        ['indesign', 'InDesign', 'ID', '20.0.0'],
        ['photoshop', 'Photoshop', 'PS', '26.0.0'],
    ])('%s targets its host and carries the host-table plugin id', (folder, hostName, app, minVersion) => {
        // Scenario: each package installs into one host (ADR-002 §1); the id is the sessions folder name.
        const manifest = kMANIFESTS[folder];
        expect(manifest.manifestVersion).toBe(5);
        expect(manifest.host).toEqual({ app, minVersion });
        expect(manifest.id).toBe(HOSTS[hostName].pluginId);
    });

    test('the InDesign plugin id is unchanged from v0.2.0 so existing sessions stay visible', () => {
        // Scenario: the InDesign plugin updates in place over the installed v0.2.0.
        expect(kMANIFESTS.indesign.id).toBe('com.atomic.indesign-sessions');
        expect(HOSTS.InDesign.pluginId).toBe('com.atomic.indesign-sessions');
    });

    test('the plugin ids are distinct', () => {
        // Scenario: two packages with one id would replace each other and share a sessions folder.
        expect(kMANIFESTS.indesign.id).not.toBe(kMANIFESTS.photoshop.id);
    });

    test('both declare exactly the permissions the plugin needs', () => {
        // Scenario: full file access for documents and sessions; launch only https URLs, folders, and session files.
        for (const manifest of Object.values(kMANIFESTS)) {
            expect(manifest.requiredPermissions).toEqual({
                localFileSystem : 'fullAccess',
                launchProcess   : { schemes : ['https'], extensions : ['', '.json'] },
            });
        }
    });

    test('VERSION, package.json, and both manifests share one version', () => {
        // Scenario: repo-versioning rule; both packages are released together.
        expect(pkg.version).toBe(version);
        expect(kMANIFESTS.indesign.version).toBe(version);
        expect(kMANIFESTS.photoshop.version).toBe(version);
    });

    test('both register the panel id that main.js sets up', () => {
        // Scenario: a mismatched id leaves the panel without its entry point.
        const mainSource = fs.readFileSync(path.join(kROOT, 'src', 'main.js'), 'utf-8');
        for (const manifest of Object.values(kMANIFESTS)) {
            const panelIds = manifest.entrypoints.filter((entry) => entry.type === 'panel').map((entry) => entry.id);
            expect(panelIds).toEqual(['sessionsPanel']);
        }
        expect(mainSource).toContain("const kPANEL_ID          = 'sessionsPanel';");
    });

    test('the panel page loads its script from a file the build copies', () => {
        // Scenario: Photoshop does not run inline scripts in plugin panels, so the page must use <script src>.
        const html = fs.readFileSync(path.join(kROOT, 'index.html'), 'utf-8');
        expect(html).toContain('<script src="index.js"></script>');
        expect(html).not.toMatch(/<script>\s*\S/);
        const buildSource = fs.readFileSync(path.join(kROOT, 'scripts', 'build.mjs'), 'utf-8');
        expect(buildSource).toContain("'index.js'");
    });

    test('point at shared files that the build copies into each plugin folder', () => {
        // Scenario: a missing main page or icon fails to load or package.
        for (const manifest of Object.values(kMANIFESTS)) {
            const icons = [...manifest.icons, ...manifest.entrypoints.flatMap((entry) => entry.icons)];
            for (const file of [manifest.main, ...icons.flatMap(iconFiles)]) {
                expect(fs.existsSync(path.join(kROOT, file))).toBe(true);
            }
        }
    });
});
