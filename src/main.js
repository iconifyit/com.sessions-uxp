/**
 * Composition root: builds the components with their real InDesign and UXP collaborators
 * and registers the panel entry point.
 */
const { app }         = require('indesign');
const uxp             = require('uxp');
const fs              = require('fs');
const os              = require('os');

const { resolveSessionsLocation } = require('./sessions/storageLocation.js');
const { SessionStore }            = require('./sessions/SessionStore.js');
const { InDesignDocuments }       = require('./host/InDesignDocuments.js');
const { Platform }                = require('./host/Platform.js');
const { SessionWorkflows }        = require('./workflows/SessionWorkflows.js');
const { MenuCommand, SessionsPanel } = require('./ui/panel.js');
const dialogs                     = require('./ui/dialogs.js');

const kPANEL_ID          = 'sessionsPanel';
const kDOCUMENTATION_URL = 'https://github.com/iconifyit/com.sessions-uxp#readme';

const location  = resolveSessionsLocation({ homeDirectory : os.homedir(), platform : os.platform() });
const store     = new SessionStore({ fs, directory : location.directory, separator : location.separator });
const platform  = new Platform({ fs, localFileSystem : uxp.storage.localFileSystem, shell : uxp.shell });
const workflows = new SessionWorkflows({
    store,
    documents            : new InDesignDocuments({ app }),
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
            menuItems : [
                { id : MenuCommand.COLLECT, label : 'Collect Open Documents…' },
                { id : MenuCommand.SHOW_FOLDER, label : 'Show Sessions Folder' },
                '-',
                { id : MenuCommand.DOCUMENTATION, label : 'Documentation' },
            ],
            invokeMenu(commandId) {
                return panel.handleMenu(commandId);
            },
        },
    },
});
