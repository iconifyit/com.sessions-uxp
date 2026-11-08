/**
 * Path helpers for the workflows. UXP has no `path` module guarantee across versions,
 * and these rules (collision naming, open-document matching) are product decisions,
 * so they are implemented here explicitly.
 */

/**
 * Returns the last segment of a macOS or Windows path.
 * @param {string} path
 * @returns {string}
 */
const baseName = (path) => path.split(/[\\/]/).filter(Boolean).pop() || '';

/**
 * Joins a folder and a file name using the folder's own separator.
 * @param {string} folder - Absolute folder path.
 * @param {string} fileName
 * @returns {string}
 */
const joinPath = (folder, fileName) => {
    const separator = folder.includes('\\') && !folder.includes('/') ? '\\' : '/';
    const trimmed   = folder.endsWith(separator) ? folder.slice(0, -1) : folder;
    return `${trimmed}${separator}${fileName}`;
};

/**
 * Normalizes a path into a comparison key: unifies separators, resolves `.` and `..`,
 * drops trailing separators, and lower-cases when the file system is case-insensitive.
 * @param {string} path - Absolute path.
 * @param {boolean} caseInsensitive - True on macOS and Windows default volumes.
 * @returns {string}
 */
const pathKey = (path, caseInsensitive) => {
    const segments = [];
    for (const segment of path.replace(/\\/g, '/').split('/')) {
        if (segment === '' || segment === '.') {
            continue;
        }
        if (segment === '..') {
            segments.pop();
            continue;
        }
        segments.push(segment);
    }
    const key = `/${segments.join('/')}`;
    return caseInsensitive ? key.toLowerCase() : key;
};

/**
 * Splits a file name into stem and extension; dot-files and names without a dot have no extension.
 * @param {string} fileName
 * @returns {{ stem: string, extension: string }}
 */
const splitExtension = (fileName) => {
    const dot = fileName.lastIndexOf('.');
    if (dot <= 0) {
        return { stem : fileName, extension : '' };
    }
    return { stem : fileName.slice(0, dot), extension : fileName.slice(dot) };
};

/**
 * Chooses a target file name that is not taken, appending ` (2)`, ` (3)`, … before the extension.
 * @param {string} fileName - Desired name, for example `catalog.indd`.
 * @param {(candidate: string) => boolean|Promise<boolean>} isTaken - Whether a candidate name is already used.
 * @returns {Promise<string>} The first free name.
 * @example
 * await uniqueTargetName('catalog.indd', (name) => name === 'catalog.indd'); // => 'catalog (2).indd'
 */
const uniqueTargetName = async (fileName, isTaken) => {
    if (!(await isTaken(fileName))) {
        return fileName;
    }
    const { stem, extension } = splitExtension(fileName);
    let counter = 2;
    while (await isTaken(`${stem} (${counter})${extension}`)) {
        counter += 1;
    }
    return `${stem} (${counter})${extension}`;
};

module.exports = {
    baseName,
    joinPath,
    pathKey,
    uniqueTargetName,
};
