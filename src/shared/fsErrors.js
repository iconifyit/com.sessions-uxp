/**
 * Classifies file-system errors from both the UXP `fs` module and Node's `fs/promises`.
 *
 * UXP reports POSIX errors as negative numeric codes (`-2`, `-17`), while Node uses
 * string codes (`ENOENT`, `EEXIST`). Components that run in both environments use
 * these predicates instead of comparing codes directly.
 */

const kNOT_FOUND_CODES      = new Set(['ENOENT', -2]);
const kALREADY_EXISTS_CODES = new Set(['EEXIST', -17]);

/**
 * Returns true when the error means the path does not exist.
 * @param {*} error - Error thrown by an `fs` call.
 * @returns {boolean}
 */
const isNotFoundError = (error) => Boolean(error) && kNOT_FOUND_CODES.has(error.code);

/**
 * Returns true when the error means the path already exists.
 * @param {*} error - Error thrown by an `fs` call.
 * @returns {boolean}
 */
const isAlreadyExistsError = (error) => Boolean(error) && kALREADY_EXISTS_CODES.has(error.code);

module.exports = {
    isAlreadyExistsError,
    isNotFoundError,
};
