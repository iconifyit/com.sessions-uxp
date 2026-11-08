const fs   = require('fs');
const path = require('path');

const kROOT    = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(kROOT, 'manifest.json'), 'utf-8'));
const pkg      = JSON.parse(fs.readFileSync(path.join(kROOT, 'package.json'), 'utf-8'));
const version  = fs.readFileSync(path.join(kROOT, 'VERSION'), 'utf-8').trim();

/**
 * Expands a manifest icon entry into the files UXP loads for each scale (`name@1x.png`, `name@2x.png`).
 * @param {{ path: string, scale: number[] }} icon
 * @returns {string[]}
 */
const iconFiles = (icon) => icon.scale.map((scale) => icon.path.replace(/\.png$/, `@${scale}x.png`));

describe('manifest.json', () => {
    test('targets InDesign 20.0+ with manifest v5 (ADR-001 §1)', () => {
        // Scenario: flyout menus require InDesign 20.0.
        expect(manifest.manifestVersion).toBe(5);
        expect(manifest.host).toEqual({ app : 'ID', minVersion : '20.0.0' });
        expect(manifest.id).toBe('com.atomic.indesign-sessions');
    });

    test('declares exactly the permissions the plugin needs', () => {
        // Scenario: full file access for documents and sessions; launch only https URLs, folders, and session files.
        expect(manifest.requiredPermissions).toEqual({
            localFileSystem : 'fullAccess',
            launchProcess   : { schemes : ['https'], extensions : ['', '.json'] },
        });
    });

    test('keeps VERSION, package.json, and manifest.json in sync', () => {
        // Scenario: repo-versioning rule.
        expect(manifest.version).toBe(version);
        expect(pkg.version).toBe(version);
    });

    test('registers the panel id that main.js sets up', () => {
        // Scenario: a mismatched id leaves the panel without its entry point.
        const mainSource = fs.readFileSync(path.join(kROOT, 'src', 'main.js'), 'utf-8');
        const panelIds   = manifest.entrypoints.filter((entry) => entry.type === 'panel').map((entry) => entry.id);
        expect(panelIds).toEqual(['sessionsPanel']);
        expect(mainSource).toContain(`const kPANEL_ID          = '${panelIds[0]}';`);
    });

    test('points at files that exist', () => {
        // Scenario: a missing main page or icon fails to load or package.
        const icons = [...manifest.icons, ...manifest.entrypoints.flatMap((entry) => entry.icons)];
        const files = [manifest.main, ...icons.flatMap(iconFiles)];
        for (const file of files) {
            expect(fs.existsSync(path.join(kROOT, file))).toBe(true);
        }
    });
});
