const fsPromises = require('fs/promises');

/**
 * Node `fs/promises` restricted to the file-system subset SessionStore may use
 * (ADR-001 §3). Exposing only this subset makes a test fail if the store starts
 * depending on a call the UXP `fs` module might not provide.
 * @returns {object}
 */
const createNodeFs = () => ({
    mkdir     : (path, options) => fsPromises.mkdir(path, options),
    readdir   : (path) => fsPromises.readdir(path),
    readFile  : (path, options) => fsPromises.readFile(path, options),
    rename    : (from, to) => fsPromises.rename(from, to),
    unlink    : (path) => fsPromises.unlink(path),
    writeFile : (path, data, options) => fsPromises.writeFile(path, data, options),
});

module.exports = {
    createNodeFs,
};
