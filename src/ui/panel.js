const {
    describeCopyResult,
    describeInvalidFiles,
    describeOpenResult,
    describeSaveResult,
    describeSessionMeta,
} = require('./messages.js');

/**
 * Flyout menu command ids (ADR-001 §5).
 */
const MenuCommand = Object.freeze({
    COLLECT       : 'collectOpenDocuments',
    DOCUMENTATION : 'documentation',
    SHOW_FOLDER   : 'showSessionsFolder',
});

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
            rename  : doc.getElementById('rename-button'),
            edit    : doc.getElementById('describe-button'),
            copy    : doc.getElementById('copy-button'),
            show    : doc.getElementById('show-file-button'),
            remove  : doc.getElementById('delete-button'),
        };
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
        elements.rename.addEventListener('click', () => this.run(() => this.renameSelected()));
        elements.edit.addEventListener('click', () => this.run(() => this.describeSelected()));
        elements.copy.addEventListener('click', () => this.run(() => this.copySelected()));
        elements.show.addEventListener('click', () => this.run(() => this.showSelectedFile()));
        elements.remove.addEventListener('click', () => this.run(() => this.deleteSelected()));
        elements.list.addEventListener('click', (event) => this.selectRow(event.target));
        elements.list.addEventListener('dblclick', (event) => {
            if (this.selectRow(event.target)) {
                this.run(() => this.openSelected());
            }
        });
    }

    /**
     * Handles a flyout menu command.
     * @param {string} commandId
     * @returns {Promise<void>}
     */
    handleMenu(commandId) {
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
            row.dataset.id = session.id;
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
        empty.classList.toggle('is-hidden', this.sessions.length > 0);
        list.classList.toggle('is-hidden', this.sessions.length === 0);
        this.updateButtons();
    }

    /**
     * Selects the row containing the event target.
     * @param {EventTarget} target
     * @returns {boolean} True when a row was selected.
     */
    selectRow(target) {
        const row = target && target.closest ? target.closest('.session-row') : null;
        if (!row) {
            return false;
        }
        this.selectedId = row.dataset.id;
        for (const candidate of this.elements.list.querySelectorAll('.session-row')) {
            candidate.classList.toggle('is-selected', candidate.dataset.id === this.selectedId);
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
        const needsSelection = [elements.open, elements.rename, elements.edit, elements.copy, elements.show, elements.remove];
        for (const button of needsSelection) {
            setDisabled(button, this.busy || this.selectedId === null);
        }
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
            notes.push(`${untitledCount} untitled document(s) will be skipped.`);
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
};
