const { Platform } = require('../../src/host/Platform.js');

const kPATH = '/Users/scott/Dropbox/clients/acme/catalog.indd';

/**
 * Builds a Platform with stubbed UXP services.
 * @param {object} overrides
 * @returns {Platform}
 */
const createPlatform = (overrides = {}) => new Platform({
    fs              : { copyFile : jest.fn(), lstat : jest.fn() },
    localFileSystem : { getFolder : jest.fn() },
    shell           : { openPath : jest.fn().mockResolvedValue(''), openExternal : jest.fn().mockResolvedValue('') },
    ...overrides,
});

describe('Platform.fileExists', () => {
    test('is true when lstat succeeds', async () => {
        // Scenario: the document is on disk.
        const platform = createPlatform({ fs : { lstat : jest.fn().mockResolvedValue({ isFile : () => true }) } });
        await expect(platform.fileExists(kPATH)).resolves.toBe(true);
    });

    test.each([['UXP', -2], ['Node', 'ENOENT']])('is false when %s reports not found', async (_label, code) => {
        // Scenario: the document was moved or deleted since the session was saved.
        const platform = createPlatform({ fs : { lstat : jest.fn().mockRejectedValue(Object.assign(new Error('no such file or directory'), { code })) } });
        await expect(platform.fileExists(kPATH)).resolves.toBe(false);
    });

    test('rethrows other failures', async () => {
        // Scenario: the volume denies access; this must not be reported as "missing".
        const platform = createPlatform({ fs : { lstat : jest.fn().mockRejectedValue(Object.assign(new Error('permission denied'), { code : -13 })) } });
        await expect(platform.fileExists(kPATH)).rejects.toThrow('permission denied');
    });
});

describe('Platform.pickFolder', () => {
    test('returns the native path of the chosen folder', async () => {
        // Scenario: the user picks a delivery folder.
        const platform = createPlatform({ localFileSystem : { getFolder : jest.fn().mockResolvedValue({ nativePath : '/Users/scott/Desktop/Delivery' }) } });
        await expect(platform.pickFolder()).resolves.toBe('/Users/scott/Desktop/Delivery');
    });

    test('returns null when the user cancels', async () => {
        // Scenario: the picker is dismissed.
        const platform = createPlatform({ localFileSystem : { getFolder : jest.fn().mockResolvedValue(null) } });
        await expect(platform.pickFolder()).resolves.toBeNull();
    });
});

describe('Platform.openPath / openExternal', () => {
    test('resolve when UXP reports success with an empty string', async () => {
        // Scenario: the user consents and the OS opens the location.
        const platform = createPlatform();
        await expect(platform.openPath('/Users/scott/Library/Application Support/com.atomic')).resolves.toBeUndefined();
        await expect(platform.openExternal('https://github.com/iconifyit/com.sessions-uxp#readme')).resolves.toBeUndefined();
    });

    test('reject with the UXP failure message', async () => {
        // Scenario: the user declines the consent prompt.
        const shell    = { openPath : jest.fn().mockResolvedValue('User denied permission'), openExternal : jest.fn().mockResolvedValue('Scheme not allowed') };
        const platform = createPlatform({ shell });
        await expect(platform.openPath('/Users/scott/Desktop')).rejects.toThrow('User denied permission');
        await expect(platform.openExternal('https://example.com')).rejects.toThrow('Scheme not allowed');
    });
});
