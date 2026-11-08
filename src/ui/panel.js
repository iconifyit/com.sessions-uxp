const {
    describeCopyResult,
    describeInvalidFiles,
    describeOpenResult,
    describeSaveResult,
    describeSessionMeta,
} = require('./messages.js');
const { ContextMenu } = require('./contextMenu.js');

/**
 * Menu command ids shared by the right-click menu and the flyout menu (ADR-001 §5).
 */
const MenuCommand = Object.freeze({
    COLLECT            : 'collectOpenDocuments',
    COPY_SESSION_FILES : 'copySessionFiles',
    DELETE_SESSION     : 'deleteSession',
    DESCRIBE_SESSION   : 'describeSession',
    DOCUMENTATION      : 'documentation',
    OPEN_SESSION       : 'openSession',
    RENAME_SESSION     : 'renameSession',
    SHOW_FOLDER        : 'showSessionsFolder',
    SHOW_SESSION_FILE  : 'showSessionFile',
});

/**
 * Actions on the selected session, in menu order. `label` is used in the right-click menu,
 * `flyoutLabel` in the panel flyout menu.
 */
const kSESSION_MENU = Object.freeze([
    { id : MenuCommand.OPEN_SESSION, label : 'Open', flyoutLabel : 'Open Session' },
    { id : MenuCommand.RENAME_SESSION, label : 'Rename…', flyoutLabel : 'Rename Session…' },
    { id : MenuCommand.DESCRIBE_SESSION, label : 'Describe…', flyoutLabel : 'Describe Session…' },
    { id : MenuCommand.COPY_SESSION_FILES, label : 'Copy Files…', flyoutLabel : 'Copy Session Files…' },
    { id : MenuCommand.SHOW_SESSION_FILE, label : 'Show File', flyoutLabel : 'Show Session File' },
    { divider : true },
    { id : MenuCommand.DELETE_SESSION, label : 'Delete…', flyoutLabel : 'Delete Session…' },
]);

/**
 * Flyout menu items for `entrypoints.setup`: the session actions, then panel-level commands.
 */
const kFLYOUT_MENU_ITEMS = Object.freeze([
    ...kSESSION_MENU.map((item) => (item.divider ? '-' : { id : item.id, label : item.flyoutLabel })),
    '-',
    { id : MenuCommand.COLLECT, label : 'Collect Open Documents…' },
    { id : MenuCommand.SHOW_FOLDER, label : 'Show Sessions Folder' },
    '-',
    { id : MenuCommand.DOCUMENTATION, label : 'Documentation' },
]);

const kDATE_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle : 'medium', timeStyle : 'short' });

/**
 * The Sessions panel: renders the list, maps gestures and flyout commands to the
 * workflows and store, and shows results. Owns no session rules of its own.
 */
class SessionsPanel {
    /**
     * @param {object} params
     * @param {Document} params.doc - Panel document.
     * @param {object} params.store - SessionStore (list, update, remove, directory, filePathFor).
     * @param {object} params.workflows - SessionWorkflows.
     * @param {object} params.platform - Platform (pickFolder, openPath, openExternal).
     * @param {object} params.dialogs - `{ promptSessionDetails, confirmAction }`.
     * @param {string} params.documentationUrl
     */
    constructor({ doc, store, workflows, platform, dialogs, documentationUrl }) {
        this.doc              = doc;
        this.store            = store;
        this.workflows        = workflows;
        this.platform         = platform;
        this.dialogs          = dialogs;
        this.documentationUrl = documentationUrl;
        this.sessions         = [];
        this.selectedId       = null;
        this.busy             = false;
        this.elements         = {
            list    : doc.getElementById('session-list'),
            empty   : doc.getElementById('empty-state'),
            message : doc.getElementById('message'),
            save    : doc.getElementById('save-button'),
            open    : doc.getElementById('open-button'),
        };
        this.sessionCommands = {
            [MenuCommand.OPEN_SESSION]       : () => this.openSelected(),
            [MenuCommand.RENAME_SESSION]     : () => this.renameSelected(),
            [MenuCommand.DESCRIBE_SESSION]   : () => this.describeSelected(),
            [MenuCommand.COPY_SESSION_FILES] : () => this.copySelected(),
            [MenuCommand.SHOW_SESSION_FILE]  : () => this.showSelectedFile(),
            [MenuCommand.DELETE_SESSION]     : () => this.deleteSelected(),
        };
        this.contextMenu = new ContextMenu({
            doc,
            container : doc.body,
            items     : kSESSION_MENU,
            onSelect  : (commandId) => this.handleMenu(commandId),
        });
        this.bindEvents();
    }

    /**
     * Wires buttons and list gestures to actions.
     * @returns {void}
     */
    bindEvents() {
        const { elements } = this;
        elements.save.addEventListener('click', () => this.run(() => this.saveSession()));
        elements.open.addEventListener('click', () => this.run(() => this.openSelected()));
        elements.list.addEventListener('click', (event) => this.selectRow(event.target));
        elements.list.addEventListener('dblclick', (event) => {
            if (this.selectRow(event.target)) {
                this.run(() => this.openSelected());
            }
        });
        // Right-click opens the session menu. Both the pointer event and the contextmenu
        // event are handled because the host decides which of them a panel receives;
        // opening the menu twice at the same point is harmless.
        this.doc.addEventListener('pointerdown', (event) => this.handlePointerDown(event));
        this.doc.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            this.openContextMenu(event);
        });
        this.doc.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.contextMenu.hide();
            }
        });
    }

    /**
     * Opens the session menu on a secondary-button press over a session; any other press
     * outside the menu closes it.
     * @param {PointerEvent} event
     * @returns {void}
     */
    handlePointerDown(event) {
        if (this.contextMenu.contains(event.target)) {
            return;
        }
        if (event.button === 2) {
            this.openContextMenu(event);
            return;
        }
        this.contextMenu.hide();
    }

    /**
     * Selects the session under the pointer and shows the session menu there; outside a
     * session row the menu is closed.
     * @param {MouseEvent} event
     * @returns {void}
     */
    openContextMenu(event) {
        if (this.busy || !this.selectRow(event.target)) {
            this.contextMenu.hide();
            return;
        }
        this.contextMenu.show({ x : event.clientX, y : event.clientY });
    }

    /**
     * Handles a command from the flyout menu or the right-click menu.
     * @param {string} commandId
     * @returns {Promise<void>}
     */
    handleMenu(commandId) {
        const sessionCommand = this.sessionCommands[commandId];
        if (sessionCommand) {
            return this.run(async () => {
                if (!this.selectedSession()) {
                    this.showMessage({ tone : 'warning', text : 'Select a session first.' });
                    return;
                }
                await sessionCommand();
            });
        }
        if (commandId === MenuCommand.COLLECT) {
            return this.run(() => this.collectOpenDocuments());
        }
        if (commandId === MenuCommand.SHOW_FOLDER) {
            return this.run(() => this.showSessionsFolder());
        }
        if (commandId === MenuCommand.DOCUMENTATION) {
            return this.run(() => this.platform.openExternal(this.documentationUrl));
        }
        return Promise.resolve();
    }

    /**
     * Runs one user action at a time and shows any failure in the message area.
     * @param {() => Promise<void>} action
     * @returns {Promise<void>}
     */
    async run(action) {
        if (this.busy) {
            return;
        }
        this.busy = true;
        this.updateButtons();
        try {
            await action();
        }
        catch (error) {
            this.showMessage({ tone : 'error', text : error.message });
        }
        finally {
            this.busy = false;
            this.updateButtons();
        }
    }

    /**
     * Reloads sessions from disk and re-renders the list, keeping the selection when possible.
     * @returns {Promise<void>}
     */
    async refresh() {
        const { sessions, invalidFiles } = await this.store.list();
        this.sessions = sessions;
        if (!sessions.some((session) => session.id === this.selectedId)) {
            this.selectedId = null;
        }
        this.render();
        const warning = describeInvalidFiles(invalidFiles);
        if (warning) {
            this.showMessage(warning);
        }
    }

    /**
     * Renders the session rows and empty state.
     * @returns {void}
     */
    render() {
        const { list, empty } = this.elements;
        while (list.firstChild) {
            list.removeChild(list.firstChild);
        }
        for (const session of this.sessions) {
            const row = this.doc.createElement('div');
            row.className  = session.id === this.selectedId ? 'session-row is-selected' : 'session-row';
            row.setAttribute('data-id', session.id);
            row.title      = session.description || session.name;
            const name = this.doc.createElement('div');
            name.className   = 'session-name';
            name.textContent = session.name;
            const meta = this.doc.createElement('div');
            meta.className   = 'session-meta';
            meta.textContent = describeSessionMeta(session, (date) => kDATE_FORMAT.format(date));
            row.appendChild(name);
            row.appendChild(meta);
            list.appendChild(row);
        }
        setClass(empty, 'is-hidden', this.sessions.length > 0);
        setClass(list, 'is-hidden', this.sessions.length === 0);
        this.updateButtons();
    }

    /**
     * Selects the row containing the event target.
     * @param {EventTarget} target
     * @returns {boolean} True when a row was selected.
     */
    selectRow(target) {
        const row = findRow(target, this.elements.list);
        if (!row) {
            return false;
        }
        this.selectedId = row.getAttribute('data-id');
        for (const candidate of this.elements.list.querySelectorAll('.session-row')) {
            setClass(candidate, 'is-selected', candidate.getAttribute('data-id') === this.selectedId);
        }
        this.updateButtons();
        return true;
    }

    /**
     * Enables actions that need a selection only when one exists and nothing is running.
     * @returns {void}
     */
    updateButtons() {
        const { elements } = this;
        setDisabled(elements.open, this.busy || this.selectedId === null);
        setDisabled(elements.save, this.busy);
    }

    /**
     * Shows a status message.
     * @param {{ tone: string, text: string }} message
     * @returns {void}
     */
    showMessage({ tone, text }) {
        const { message } = this.elements;
        message.textContent = text;
        message.className   = `message message-${tone}`;
    }

    /**
     * Clears the status message.
     * @returns {void}
     */
    clearMessage() {
        this.elements.message.textContent = '';
        this.elements.message.className   = 'message is-hidden';
    }

    /**
     * The selected session record.
     * @returns {object}
     */
    selectedSession() {
        return this.sessions.find((session) => session.id === this.selectedId);
    }

    /**
     * Save Session: asks for a name and description, then saves the open documents.
     * @returns {Promise<void>}
     */
    async saveSession() {
        this.clearMessage();
        const { savablePaths, untitledCount, modifiedCount, defaultName } = await this.workflows.inspectOpenDocuments();
        if (savablePaths.length === 0 && untitledCount === 0) {
            this.showMessage({ tone : 'warning', text : 'There are no open documents to save.' });
            return;
        }
        if (savablePaths.length === 0) {
            this.showMessage(describeSaveResult({ session : null, untitledCount }));
            return;
        }
        const notes = [`${savablePaths.length} document(s) will be saved.`];
        if (untitledCount > 0) {
            notes.push(`${untitledCount} document(s) not saved to disk yet will be skipped.`);
        }
        if (modifiedCount > 0) {
            notes.push('Unsaved changes are not part of a session; only file locations are saved.');
        }
        const details = await this.dialogs.promptSessionDetails(this.doc, {
            title       : 'Save Session',
            okLabel     : 'Save',
            name        : defaultName,
            description : '',
            note        : notes.join(' '),
        });
        if (details === null) {
            return;
        }
        const result = await this.workflows.saveOpenDocuments(details);
        if (result.session) {
            this.selectedId = result.session.id;
        }
        await this.refresh();
        this.showMessage(describeSaveResult(result));
    }

    /**
     * Opens the selected session's documents.
     * @returns {Promise<void>}
     */
    async openSelected() {
        this.clearMessage();
        const result = await this.workflows.openSession(this.selectedId);
        this.showMessage(describeOpenResult(result));
    }

    /**
     * Renames the selected session.
     * @returns {Promise<void>}
     */
    async renameSelected() {
        const session = this.selectedSession();
        const details = await this.dialogs.promptSessionDetails(this.doc, { title : 'Rename Session', okLabel : 'Rename', name : session.name });
        if (details === null) {
            return;
        }
        await this.store.update(session.id, { name : details.name });
        await this.refresh();
        this.clearMessage();
    }

    /**
     * Edits the selected session's description.
     * @returns {Promise<void>}
     */
    async describeSelected() {
        const session = this.selectedSession();
        const details = await this.dialogs.promptSessionDetails(this.doc, { title : 'Describe Session', okLabel : 'Save', description : session.description || '' });
        if (details === null) {
            return;
        }
        await this.store.update(session.id, { description : details.description });
        await this.refresh();
        this.clearMessage();
    }

    /**
     * Deletes the selected session after confirmation.
     * @returns {Promise<void>}
     */
    async deleteSelected() {
        const session   = this.selectedSession();
        const confirmed = await this.dialogs.confirmAction(this.doc, {
            title       : 'Delete Session',
            message     : `Delete the session "${session.name}"? The documents themselves are not affected.`,
            okLabel     : 'Delete',
            destructive : true,
        });
        if (!confirmed) {
            return;
        }
        await this.store.remove(session.id);
        await this.refresh();
        this.showMessage({ tone : 'success', text : `Deleted "${session.name}".` });
    }

    /**
     * Copies the selected session's documents into a chosen folder.
     * @returns {Promise<void>}
     */
    async copySelected() {
        const folder = await this.platform.pickFolder();
        if (folder === null) {
            return;
        }
        const result = await this.workflows.copySessionDocuments(this.selectedId, folder);
        await this.reportCopy(result, folder);
    }

    /**
     * Copies the open documents into a chosen folder.
     * @returns {Promise<void>}
     */
    async collectOpenDocuments() {
        const folder = await this.platform.pickFolder();
        if (folder === null) {
            return;
        }
        const result = await this.workflows.collectOpenDocuments(folder);
        await this.reportCopy(result, folder);
    }

    /**
     * Shows a copy summary and offers to show the target folder.
     * @param {object} result - Copy result from the workflows.
     * @param {string} folder
     * @returns {Promise<void>}
     */
    async reportCopy(result, folder) {
        const message = describeCopyResult(result);
        this.showMessage(message);
        if (result.copied.length === 0) {
            return;
        }
        const showFolder = await this.dialogs.confirmAction(this.doc, {
            title   : 'Files Copied',
            message : `${message.text} Show the folder?`,
            okLabel : 'Show Folder',
        });
        if (showFolder) {
            await this.platform.openPath(folder);
        }
    }

    /**
     * Opens the selected session's JSON file with the operating system.
     * @returns {Promise<void>}
     */
    async showSelectedFile() {
        await this.platform.openPath(this.store.filePathFor(this.selectedId));
    }

    /**
     * Opens the sessions folder with the operating system.
     * @returns {Promise<void>}
     */
    async showSessionsFolder() {
        // Refreshing lists the folder, which also creates it on first use.
        await this.refresh();
        await this.platform.openPath(this.store.directory);
    }
}

/**
 * Finds the session row that contains a node, stopping at the list. Walks parents
 * explicitly rather than relying on `Element.closest` in the UXP DOM.
 * @param {Node} node - Event target.
 * @param {HTMLElement} list - The session list element.
 * @returns {HTMLElement|null}
 */
const findRow = (node, list) => {
    let current = node;
    while (current && current !== list) {
        if (current.classList && current.classList.contains('session-row')) {
            return current;
        }
        current = current.parentNode;
    }
    return null;
};

/**
 * Adds or removes a class.
 * @param {HTMLElement} node
 * @param {string} className
 * @param {boolean} enabled
 * @returns {void}
 */
const setClass = (node, className, enabled) => {
    if (enabled) {
        node.classList.add(className);
        return;
    }
    node.classList.remove(className);
};

/**
 * Sets or clears the disabled attribute on a Spectrum widget.
 * @param {HTMLElement} widget
 * @param {boolean} disabled
 * @returns {void}
 */
const setDisabled = (widget, disabled) => {
    if (disabled) {
        widget.setAttribute('disabled', '');
        return;
    }
    widget.removeAttribute('disabled');
};

module.exports = {
    MenuCommand,
    SessionsPanel,
    kFLYOUT_MENU_ITEMS,
    kSESSION_MENU,
};
