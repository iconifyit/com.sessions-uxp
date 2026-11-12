/**
 * Path classification shared by the Session Catalog (validating stored paths) and Host
 * Integration (deciding whether a document has a file on disk).
 */

/**
 * Returns true for an absolute macOS/POSIX path, Windows drive path, or UNC path.
 * @param {*} path
 * @returns {boolean}
 */
const isAbsolutePath = (path) => {
    if (typeof path !== 'string' || path.length === 0) {
        return false;
    }
    return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\');
};

module.exports = {
    isAbsolutePath,
};
