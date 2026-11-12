/**
 * Composition root: selects the running host (InDesign or Photoshop), builds the
 * components with their real host and UXP collaborators, and registers the panel.
 */
const kPANEL_ID          = 'sessionsPanel';
const kDOCUMENTATION_URL = 'https://github.com/iconifyit/com.sessions-uxp#readme';

/**
 * Shows a startup failure in the panel instead of leaving a panel that silently does nothing.
 * @param {Error} error
 * @returns {void}
 */
const reportStartupFailure = (error) => {
    console.error('[Sessions] The panel could not start:', error && error.stack ? error.stack : error);
    const message = document.getElementById('message');
    if (message) {
        message.textContent = `Sessions could not start: ${error && error.message ? error.message : error}`;
        message.className   = 'message message-error';
    }
};

try {
    // Loaded inside the try so a module that fails to load is also reported in the panel.
    const uxp = require('uxp');
    const fs  = require('fs');
    const os  = require('os');

    const { resolveSessionsLocation } = require('./sessions/storageLocation.js');
    const { SessionStore }            = require('./sessions/SessionStore.js');
    const { Platform }                = require('./host/Platform.js');
    const { selectHost }              = require('./hosts.js');
    const { SessionWorkflows }        = require('./workflows/SessionWorkflows.js');
    const { SessionsPanel, kFLYOUT_MENU_ITEMS } = require('./ui/panel.js');
    const dialogs                     = require('./ui/dialogs.js');

    const host      = selectHost(uxp.host.name, { requireHost : require, localFileSystem : uxp.storage.localFileSystem });
    const location  = resolveSessionsLocation({ homeDirectory : os.homedir(), platform : os.platform(), pluginFolder : host.pluginId });
    const store     = new SessionStore({ fs, directory : location.directory, separator : location.separator });
    const platform  = new Platform({ fs, localFileSystem : uxp.storage.localFileSystem, shell : uxp.shell });
    const workflows = new SessionWorkflows({
        store,
        documents            : host.documents,
        platform,
        // Default volumes on macOS and Windows are case-insensitive.
        caseInsensitivePaths : true,
    });
    const panel = new SessionsPanel({ doc : document, store, workflows, platform, dialogs, documentationUrl : kDOCUMENTATION_URL });

    uxp.entrypoints.setup({
        panels : {
            [kPANEL_ID] : {
                show() {
                    return panel.run(() => panel.refresh());
                },
                menuItems : kFLYOUT_MENU_ITEMS,
                invokeMenu(commandId) {
                    return panel.handleMenu(commandId);
                },
            },
        },
    });
}
catch (error) {
    reportStartupFailure(error);
}
