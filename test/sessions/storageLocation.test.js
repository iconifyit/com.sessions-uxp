const { resolveSessionsLocation } = require('../../src/sessions/storageLocation.js');

describe('resolveSessionsLocation', () => {
    test('macOS keeps the InDesign sessions folder exactly where v0.2.0 stored it', () => {
        // Scenario: the InDesign plugin updates in place; existing sessions must stay visible.
        expect(resolveSessionsLocation({ homeDirectory : '/Users/scott', platform : 'darwin', pluginFolder : 'com.atomic.indesign-sessions' })).toEqual({
            directory : '/Users/scott/Library/Application Support/com.atomic/com.atomic.indesign-sessions/sessions',
            separator : '/',
        });
    });

    test('macOS gives Photoshop its own sessions folder', () => {
        // Scenario: Photoshop sessions never mix with InDesign sessions.
        expect(resolveSessionsLocation({ homeDirectory : '/Users/scott', platform : 'darwin', pluginFolder : 'com.atomic.photoshop-sessions' })).toEqual({
            directory : '/Users/scott/Library/Application Support/com.atomic/com.atomic.photoshop-sessions/sessions',
            separator : '/',
        });
    });

    test('Windows uses AppData\\Roaming under the home folder for each plugin', () => {
        // Scenario: both plugins on Windows.
        expect(resolveSessionsLocation({ homeDirectory : 'C:\\Users\\scott', platform : 'win32', pluginFolder : 'com.atomic.indesign-sessions' })).toEqual({
            directory : 'C:\\Users\\scott\\AppData\\Roaming\\com.atomic\\com.atomic.indesign-sessions\\sessions',
            separator : '\\',
        });
        expect(resolveSessionsLocation({ homeDirectory : 'C:\\Users\\scott', platform : 'win32', pluginFolder : 'com.atomic.photoshop-sessions' }).directory)
            .toBe('C:\\Users\\scott\\AppData\\Roaming\\com.atomic\\com.atomic.photoshop-sessions\\sessions');
    });

    test('other platforms are rejected', () => {
        // Scenario: an unexpected platform value must fail loudly rather than write to a guessed path.
        expect(() => resolveSessionsLocation({ homeDirectory : '/home/scott', platform : 'linux', pluginFolder : 'com.atomic.photoshop-sessions' })).toThrow('Unsupported platform: linux');
    });
});
