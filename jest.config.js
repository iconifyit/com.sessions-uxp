/**
 * Jest runs the Node-testable components (Session Catalog, Session Workflows, Host
 * Integration with injected fakes, UI message formatting) outside InDesign.
 * Host behavior is verified separately by `npm run test:host`.
 */
module.exports = {
    testEnvironment : 'node',
    testMatch       : ['<rootDir>/test/**/*.test.js'],
};
