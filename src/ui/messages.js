/**
 * Turns workflow results into the short status messages shown in the panel.
 * Pure functions so the wording and counts are unit-tested outside InDesign.
 */

/**
 * Pluralizes a count with its noun.
 * @param {number} count
 * @param {string} singular
 * @param {string} [plural]
 * @returns {string} For example `1 document` or `3 documents`.
 */
const countOf = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;

/**
 * Returns the file name of a path for display.
 * @param {string} path
 * @returns {string}
 */
const displayName = (path) => path.split(/[\\/]/).filter(Boolean).pop() || path;

/**
 * Message for a save attempt.
 * @param {{ session: object|null, untitledCount: number }} result
 * @returns {{ tone: string, text: string }}
 */
const describeSaveResult = ({ session, untitledCount }) => {
    if (session === null) {
        return { tone : 'warning', text : 'Nothing was saved: none of the open documents has been saved to disk yet.' };
    }
    let text = `Saved "${session.name}" with ${countOf(session.files.length, 'document')}.`;
    if (untitledCount > 0) {
        text += ` Skipped ${countOf(untitledCount, 'untitled document')}.`;
    }
    return { tone : 'success', text };
};

/**
 * Message for opening a session.
 * @param {{ opened: string[], alreadyOpen: string[], missing: string[], failed: { path: string }[] }} result
 * @returns {{ tone: string, text: string }}
 */
const describeOpenResult = ({ opened, alreadyOpen, missing, failed }) => {
    const parts = [`Opened ${countOf(opened.length, 'document')}.`];
    if (alreadyOpen.length > 0) {
        parts.push(`${countOf(alreadyOpen.length, 'document')} already open.`);
    }
    if (missing.length > 0) {
        parts.push(`Missing: ${missing.map(displayName).join(', ')}.`);
    }
    if (failed.length > 0) {
        parts.push(`Could not open: ${failed.map((failure) => displayName(failure.path)).join(', ')}.`);
    }
    const tone = missing.length > 0 || failed.length > 0 ? 'warning' : 'success';
    return { tone, text : parts.join(' ') };
};

/**
 * Message for Copy Files or Collect Open Documents.
 * @param {object} result
 * @param {object[]} result.copied
 * @param {string[]} result.missing
 * @param {{ path: string }[]} result.failed
 * @param {number} [result.untitledCount]
 * @param {number} [result.modifiedCount]
 * @returns {{ tone: string, text: string }}
 */
const describeCopyResult = ({ copied, missing, failed, untitledCount = 0, modifiedCount = 0 }) => {
    const parts = [`Copied ${countOf(copied.length, 'document')}.`];
    if (modifiedCount > 0) {
        parts.push(`${countOf(modifiedCount, 'document')} with unsaved changes copied as last saved.`);
    }
    if (untitledCount > 0) {
        parts.push(`Skipped ${countOf(untitledCount, 'untitled document')}.`);
    }
    if (missing.length > 0) {
        parts.push(`Missing: ${missing.map(displayName).join(', ')}.`);
    }
    if (failed.length > 0) {
        parts.push(`Could not copy: ${failed.map((failure) => displayName(failure.path)).join(', ')}.`);
    }
    const tone = missing.length > 0 || failed.length > 0 ? 'warning' : 'success';
    return { tone, text : parts.join(' ') };
};

/**
 * Message for session files that could not be read.
 * @param {{ fileName: string }[]} invalidFiles
 * @returns {{ tone: string, text: string }|null} Null when every file was valid.
 */
const describeInvalidFiles = (invalidFiles) => {
    if (invalidFiles.length === 0) {
        return null;
    }
    const names = invalidFiles.map((file) => file.fileName).join(', ');
    return { tone : 'warning', text : `Ignored ${countOf(invalidFiles.length, 'unreadable session file')}: ${names}.` };
};

/**
 * Secondary line for a session row.
 * @param {object} session
 * @param {(date: Date) => string} formatDate - Locale-aware date formatter.
 * @returns {string} For example `3 documents · Nov 8, 2026, 2:32 PM`.
 */
const describeSessionMeta = (session, formatDate) => `${countOf(session.files.length, 'document')} · ${formatDate(new Date(session.createdAt))}`;

module.exports = {
    describeCopyResult,
    describeInvalidFiles,
    describeOpenResult,
    describeSaveResult,
    describeSessionMeta,
};
