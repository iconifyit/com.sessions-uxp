/**
 * Runs the in-host verification suite (macOS): asks InDesign, through AppleScript, to run
 * verify.idjs as a UXP script, waits for its result file, closes any document the suite
 * created, and reports each check. Exit code 0 only when every check passed.
 *
 * Usage: npm run test:host  (INDESIGN_APP overrides the application name, default "Adobe InDesign 2026")
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const kSUITE_DIR     = path.dirname(fileURLToPath(import.meta.url));
const kINDESIGN_APP  = process.env.INDESIGN_APP || 'Adobe InDesign 2026';
const kTIMEOUT_MS    = 5 * 60 * 1000;
const kPOLL_MS       = 1000;
const kCONFIG_PATH   = path.join(kSUITE_DIR, 'config.generated.js');

/**
 * Runs an ExtendScript file in InDesign and returns its result.
 * @param {string} scriptPath
 * @returns {string}
 */
const runExtendScript = (scriptPath) => execFileSync('osascript', [
    '-e', `tell application "${kINDESIGN_APP}" to do script POSIX file "${scriptPath}" language javascript`,
], { encoding : 'utf-8' }).trim();

/**
 * Waits until the UXP script reports completion, or the timeout elapses.
 * @param {string} resultPath
 * @returns {Promise<object|null>} The last result written, or null when none was written.
 */
const waitForResult = async (resultPath) => {
    const deadline = Date.now() + kTIMEOUT_MS;
    let latest = null;
    while (Date.now() < deadline) {
        if (fs.existsSync(resultPath)) {
            try {
                latest = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
                if (latest.done) {
                    return latest;
                }
            }
            catch (_error) {
                // The file is mid-write; read it again on the next poll.
            }
        }
        await new Promise((resolve) => setTimeout(resolve, kPOLL_MS));
    }
    return latest;
};

/**
 * Closes, without saving, only documents this run created: saved documents under the work
 * folder and the untitled documents the suite recorded by name.
 * @param {string} workDirectory
 * @param {string[]} untitledNames
 * @returns {string} InDesign's report of what was closed.
 */
const closeSuiteDocuments = (workDirectory, untitledNames) => {
    const scriptPath = path.join(workDirectory, 'cleanup.jsx');
    fs.writeFileSync(scriptPath, `
var prefix = ${JSON.stringify(workDirectory + '/')};
var untitled = ${JSON.stringify(untitledNames)};
var closed = [];
for (var i = app.documents.length - 1; i >= 0; i--) {
    var doc = app.documents[i];
    var ours = false;
    if (doc.saved) {
        ours = doc.fullName.fsName.indexOf(prefix) === 0;
    }
    else {
        for (var j = 0; j < untitled.length; j++) { if (doc.name === untitled[j]) { ours = true; } }
    }
    if (ours) { closed.push(doc.name); doc.close(SaveOptions.NO); }
}
"closed " + closed.length + " suite document(s)";
`);
    return runExtendScript(scriptPath);
};

const main = async () => {
    // Resolve symlinks (macOS /var -> /private/var) so paths match InDesign's native paths.
    const workDirectory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sessions-host-')));
    const resultPath    = path.join(workDirectory, 'result.json');
    const runnerPath    = path.join(workDirectory, 'run.jsx');
    fs.writeFileSync(kCONFIG_PATH, `module.exports = ${JSON.stringify({ workDirectory, resultPath }, null, 4)};\n`);
    fs.writeFileSync(runnerPath, `app.doScript(File(${JSON.stringify(path.join(kSUITE_DIR, 'verify.idjs'))}), ScriptLanguage.UXPSCRIPT);\n"started";\n`);

    let result = null;
    try {
        runExtendScript(runnerPath);
        result = await waitForResult(resultPath);
    }
    finally {
        console.log(closeSuiteDocuments(workDirectory, result ? result.untitledNames : []));
        fs.rmSync(kCONFIG_PATH, { force : true });
    }

    if (result === null) {
        console.error(`No result was written within ${kTIMEOUT_MS / 1000}s. Work folder kept for inspection: ${workDirectory}`);
        process.exitCode = 1;
        return;
    }
    for (const check of result.checks) {
        console.log(`${check.pass ? 'PASS' : 'FAIL'}  ${check.name}`);
        if (!check.pass) {
            console.log(`      ${JSON.stringify(check.detail)}`);
        }
    }
    const failed = result.checks.filter((check) => !check.pass).length;
    if (!result.done) {
        console.error('The verification script did not finish before the timeout.');
    }
    console.log(`${result.checks.length - failed}/${result.checks.length} checks passed.`);
    if (failed > 0 || !result.done) {
        console.error(`Work folder kept for inspection: ${workDirectory}`);
        process.exitCode = 1;
        return;
    }
    fs.rmSync(workDirectory, { recursive : true, force : true });
};

await main();
