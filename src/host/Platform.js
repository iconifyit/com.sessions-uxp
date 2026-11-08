const { isNotFoundError } = require('../shared/fsErrors.js');

// Node's fs.constants.COPYFILE_EXCL; UXP accepts the same flag value but exposes no constants.
const kCOPYFILE_EXCL = 1;

/**
 * Adapter over UXP platform services: folder picker, file copy and existence checks,
 * and handing paths and URLs to the operating system.
 */
class Platform {
    /**
     * @param {object} params
     * @param {object} params.fs - UXP `fs` module (uses `copyFile` and `lstat`).
     * @param {object} params.localFileSystem - `require("uxp").storage.localFileSystem`.
     * @param {object} params.shell - `require("uxp").shell`.
     */
    constructor({ fs, localFileSystem, shell }) {
        this.fs              = fs;
        this.localFileSystem = localFileSystem;
        this.shell           = shell;
    }

    /**
     * Shows the native folder picker.
     * @returns {Promise<string|null>} Absolute folder path, or null when the user cancels.
     */
    async pickFolder() {
        const folder = await this.localFileSystem.getFolder();
        return folder ? folder.nativePath : null;
    }

    /**
     * Copies a file exclusively: an existing target is never replaced.
     * @param {string} source - Absolute source path.
     * @param {string} target - Absolute target path.
     * @returns {Promise<void>}
     * @throws {Error} With an "already exists" code (`-17` in UXP, `EEXIST` in Node) when the target exists.
     */
    async copyFile(source, target) {
        await this.fs.copyFile(source, target, kCOPYFILE_EXCL);
    }

    /**
     * Returns true when the path exists.
     * @param {string} path - Absolute path.
     * @returns {Promise<boolean>}
     * @throws {Error} For failures other than "not found" (for example permission denied).
     */
    async fileExists(path) {
        try {
            await this.fs.lstat(path);
            return true;
        }
        catch (error) {
            if (isNotFoundError(error)) {
                return false;
            }
            throw error;
        }
    }

    /**
     * Opens a file or folder with the operating system. InDesign asks the user to consent.
     * @param {string} path - Absolute path.
     * @returns {Promise<void>}
     * @throws {Error} With the message returned by UXP when the path could not be opened.
     */
    async openPath(path) {
        const failure = await this.shell.openPath(path, 'Sessions opens this location at your request.');
        if (failure) {
            throw new Error(failure);
        }
    }

    /**
     * Opens a URL in the default browser. InDesign asks the user to consent.
     * @param {string} url - https URL.
     * @returns {Promise<void>}
     * @throws {Error} With the message returned by UXP when the URL could not be opened.
     */
    async openExternal(url) {
        const failure = await this.shell.openExternal(url, 'Sessions opens its documentation at your request.');
        if (failure) {
            throw new Error(failure);
        }
    }
}

module.exports = {
    Platform,
};
