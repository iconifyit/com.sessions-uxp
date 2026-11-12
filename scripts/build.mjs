/**
 * Copy-only build (ADR-002 §2). For each host, assembles `dist/<host>/` from that host's
 * manifest plus the shared panel files, rebuilding the folder from empty so a deleted
 * source file is never shipped. With `--package`, also zips each folder into
 * `dist/<plugin id>-<version>.ccx` with `manifest.json` at the archive root.
 *
 * Usage: node scripts/build.mjs [--package]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const kROOT         = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kDIST         = path.join(kROOT, 'dist');
const kHOSTS        = ['indesign', 'photoshop'];
const kSHARED_FILES = ['index.html', 'index.js', 'src', 'icons'];

/**
 * Assembles one host's plugin folder.
 * @param {string} host - Folder name under `hosts/`.
 * @returns {{ folder: string, manifest: object }}
 */
const buildHost = (host) => {
    const folder = path.join(kDIST, host);
    fs.rmSync(folder, { recursive : true, force : true });
    fs.mkdirSync(folder, { recursive : true });
    fs.copyFileSync(path.join(kROOT, 'hosts', host, 'manifest.json'), path.join(folder, 'manifest.json'));
    for (const entry of kSHARED_FILES) {
        fs.cpSync(path.join(kROOT, entry), path.join(folder, entry), { recursive : true });
    }
    return { folder, manifest : JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf-8')) };
};

/**
 * Zips a built plugin folder into a `.ccx` package.
 * @param {string} folder - Built plugin folder.
 * @param {{ id: string, version: string }} manifest
 * @returns {string} Package path.
 */
const packageHost = (folder, manifest) => {
    const packagePath = path.join(kDIST, `${manifest.id}-${manifest.version}.ccx`);
    fs.rmSync(packagePath, { force : true });
    execFileSync('zip', ['-q', '-r', '-X', packagePath, '.'], { cwd : folder });
    return packagePath;
};

const shouldPackage = process.argv.includes('--package');
for (const host of kHOSTS) {
    const { folder, manifest } = buildHost(host);
    console.log(`built   ${path.relative(kROOT, folder)} (${manifest.id} ${manifest.version})`);
    if (shouldPackage) {
        console.log(`packaged ${path.relative(kROOT, packageHost(folder, manifest))}`);
    }
}
