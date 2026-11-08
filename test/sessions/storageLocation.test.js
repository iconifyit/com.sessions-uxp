const { resolveSessionsLocation } = require('../../src/sessions/storageLocation.js');

describe('resolveSessionsLocation', () => {
    test('macOS uses Application Support under the home folder', () => {
        // Scenario: plugin running in InDesign on macOS.
        expect(resolveSessionsLocation({ homeDirectory : '/Users/scott', platform : 'darwin' })).toEqual({
            directory : '/Users/scott/Library/Application Support/com.atomic/com.atomic.indesign-sessions/sessions',
            separator : '/',
        });
    });

    test('Windows uses AppData\\Roaming under the home folder', () => {
        // Scenario: plugin running in InDesign on Windows.
        expect(resolveSessionsLocation({ homeDirectory : 'C:\\Users\\scott', platform : 'win32' })).toEqual({
            directory : 'C:\\Users\\scott\\AppData\\Roaming\\com.atomic\\com.atomic.indesign-sessions\\sessions',
            separator : '\\',
        });
    });

    test('other platforms are rejected', () => {
        // Scenario: an unexpected platform value must fail loudly rather than write to a guessed path.
        expect(() => resolveSessionsLocation({ homeDirectory : '/home/scott', platform : 'linux' })).toThrow('Unsupported platform: linux');
    });
});
