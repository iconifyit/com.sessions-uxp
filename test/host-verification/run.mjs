/**
 * Runs the in-host verification suite (macOS) in InDesign or Photoshop: starts the host's
 * entry script (verify.idjs or verify.psjs) as a UXP script, waits for its result file,
 * closes any document the suite created, and reports each check. Exit code 0 only when
 * every check passed.
 *
 * Usage: npm run test:host -- --host indesign|photoshop   (default: indesign)
 * INDESIGN_APP / PHOTOSHOP_APP override the application names
 * (defaults "Adobe InDesign 2026" / "Adobe Photoshop 2026").
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const kSUITE_DIR     = path.dirname(fileURLToPath(import.meta.url));
const kINDESIGN_APP  = process.env.INDESIGN_APP || 'Adobe InDesign 2026';
const kPHOTOSHOP_APP = process.env.PHOTOSHOP_APP || 'Adobe Photoshop 2026';
const kSEED_IMAGE    = path.resolve(kSUITE_DIR, '..', '..', 'icons', 'plugin@2x.png');
const kTIMEOUT_MS    = 5 * 60 * 1000;
const kPOLL_MS       = 1000;
const kOSASCRIPT_TIMEOUT_MS = 60 * 1000;
const kCONFIG_PATH   = path.join(kSUITE_DIR, 'config.generated.js');

/**
 * Runs an ExtendScript file in InDesign and returns its result.
 * @param {string} scriptPath
 * @returns {string}
 */
const runExtendScript = (scriptPath) => execFileSync('osascript', [
    '-e', `tell application "${kINDESIGN_APP}" to do script POSIX file "${scriptPath}" language javascript`,
], { encoding : 'utf-8', timeout : kOSASCRIPT_TIMEOUT_MS }).trim();

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
 * Runs a UXP script in Photoshop. Photoshop runs a .psjs opened with it, without a prompt.
 * @param {string} scriptPath
 * @returns {void}
 */
const runPhotoshopScript = (scriptPath) => {
    execFileSync('open', ['-a', kPHOTOSHOP_APP, scriptPath], { timeout : kOSASCRIPT_TIMEOUT_MS });
};

/**
 * InDesign safety-net cleanup: closes, without saving, only documents this run created —
 * saved documents under the work folder and the untitled documents recorded by name.
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

/**
 * Photoshop safety-net cleanup: closes, without saving, only documents this run created —
 * those whose ids the suite recorded or whose path lies under the work folder.
 * @param {string} workDirectory
 * @param {number[]} documentIds
 * @returns {Promise<string>} Report of what was closed.
 */
const closePhotoshopSuiteDocuments = async (workDirectory, documentIds) => {
    const scriptPath = path.join(workDirectory, 'cleanup.psjs');
    const reportPath = path.join(workDirectory, 'cleanup.txt');
    fs.writeFileSync(scriptPath, `
const { app, core } = require('photoshop');
const fs = require('fs');
const prefix = ${JSON.stringify(workDirectory + '/')};
const ids = ${JSON.stringify(documentIds)};
let closed = 0;
try {
    await core.executeAsModal(async () => {
        for (const document of [...app.documents]) {
            if (ids.includes(document.id) || (document.path || '').startsWith(prefix)) {
                await document.closeWithoutSaving();
                closed += 1;
            }
        }
    }, { commandName : 'Close suite documents' });
    fs.writeFileSync(${JSON.stringify(reportPath)}, 'closed ' + closed + ' suite document(s)', { encoding : 'utf-8' });
}
catch (error) {
    fs.writeFileSync(${JSON.stringify(reportPath)}, 'cleanup failed: ' + error, { encoding : 'utf-8' });
}
`);
    runPhotoshopScript(scriptPath);
    const deadline = Date.now() + kOSASCRIPT_TIMEOUT_MS;
    while (Date.now() < deadline && !fs.existsSync(reportPath)) {
        await new Promise((resolve) => setTimeout(resolve, kPOLL_MS));
    }
    return fs.existsSync(reportPath) ? fs.readFileSync(reportPath, 'utf-8') : 'cleanup did not report';
};

/**
 * Per-host start and cleanup.
 */
const kHOSTS = {
    indesign : {
        start : (workDirectory) => {
            const runnerPath = path.join(workDirectory, 'run.jsx');
            fs.writeFileSync(runnerPath, `app.doScript(File(${JSON.stringify(path.join(kSUITE_DIR, 'verify.idjs'))}), ScriptLanguage.UXPSCRIPT);\n"started";\n`);
            runExtendScript(runnerPath);
        },
        cleanup : async (workDirectory, result) => closeSuiteDocuments(workDirectory, result ? result.untitledNames : []),
    },
    photoshop : {
        start   : () => runPhotoshopScript(path.join(kSUITE_DIR, 'verify.psjs')),
        cleanup : (workDirectory, result) => closePhotoshopSuiteDocuments(workDirectory, result ? result.documentIds : []),
    },
};

/**
 * Reads `--host <name>` from the command line.
 * @returns {string}
 * @throws {Error} For an unknown host.
 */
const hostFromArguments = () => {
    const index = process.argv.indexOf('--host');
    const name  = index >= 0 ? process.argv[index + 1] : 'indesign';
    if (!kHOSTS[name]) {
        throw new Error(`Unknown host "${name}". Use --host indesign or --host photoshop.`);
    }
    return name;
};

const main = async () => {
    const hostName = hostFromArguments();
    const host     = kHOSTS[hostName];
    // Resolve symlinks (macOS /var -> /private/var) so paths match the hosts' native paths.
    const workDirectory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sessions-host-')));
    const resultPath    = path.join(workDirectory, 'result.json');
    fs.writeFileSync(kCONFIG_PATH, `module.exports = ${JSON.stringify({ workDirectory, resultPath, seedImagePath : kSEED_IMAGE }, null, 4)};\n`);
    console.log(`Running the in-host suite in ${hostName}…`);

    let result = null;
    try {
        host.start(workDirectory);
        result = await waitForResult(resultPath);
    }
    finally {
        fs.rmSync(kCONFIG_PATH, { force : true });
        try {
            console.log(await host.cleanup(workDirectory, result));
        }
        catch (error) {
            // Reported without masking the original failure; leftover documents are named in the work folder.
            console.error(`Cleanup could not close suite documents: ${error.message}`);
        }
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
