/**
 * Resolves the version-independent folder that holds session files (ADR-001 §2).
 *
 * The UXP plugin data folder is deliberately not used: it is scoped per InDesign
 * version and per install type, so sessions would disappear on upgrade.
 */

const kVENDOR_FOLDER = 'com.atomic';
const kPLUGIN_FOLDER = 'com.atomic.indesign-sessions';
const kSESSIONS_DIR  = 'sessions';

/**
 * Resolves the sessions folder for the current user and platform.
 * @param {object} params
 * @param {string} params.homeDirectory - Value of `os.homedir()`.
 * @param {string} params.platform - Value of `os.platform()` (`darwin` or `win32`).
 * @returns {{ directory: string, separator: string }} Absolute folder path and its path separator.
 * @throws {Error} On an unsupported platform.
 * @example
 * resolveSessionsLocation({ homeDirectory: '/Users/scott', platform: 'darwin' });
 * // => { directory: '/Users/scott/Library/Application Support/com.atomic/com.atomic.indesign-sessions/sessions', separator: '/' }
 */
const resolveSessionsLocation = ({ homeDirectory, platform }) => {
    if (platform === 'darwin') {
        const parts = [homeDirectory, 'Library', 'Application Support', kVENDOR_FOLDER, kPLUGIN_FOLDER, kSESSIONS_DIR];
        return { directory : parts.join('/'), separator : '/' };
    }
    if (platform === 'win32') {
        const parts = [homeDirectory, 'AppData', 'Roaming', kVENDOR_FOLDER, kPLUGIN_FOLDER, kSESSIONS_DIR];
        return { directory : parts.join('\\'), separator : '\\' };
    }
    throw new Error(`Unsupported platform: ${platform}`);
};

module.exports = {
    resolveSessionsLocation,
};
