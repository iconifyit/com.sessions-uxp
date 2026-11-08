/**
 * Modal dialogs built on the HTML `<dialog>` element, the supported way to collect input
 * in a UXP panel (`prompt`/`confirm` are beta and disabled by default).
 *
 * Each dialog is created on demand and removed after it closes, because UXP does not
 * remove closed dialogs from the DOM.
 */

/**
 * Creates an element with attributes and children.
 * @param {Document} doc
 * @param {string} tag
 * @param {object} [attributes]
 * @param {(Node|string)[]} [children]
 * @returns {HTMLElement}
 */
const element = (doc, tag, attributes = {}, children = []) => {
    const node = doc.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) {
        if (value === true) {
            node.setAttribute(name, '');
        }
        else if (value !== false && value !== undefined) {
            node.setAttribute(name, String(value));
        }
    }
    for (const child of children) {
        node.appendChild(typeof child === 'string' ? doc.createTextNode(child) : child);
    }
    return node;
};

/**
 * Shows a dialog modally and resolves with the value its buttons produce.
 * Escape or closing the window resolves with `cancelValue`.
 * @param {Document} doc
 * @param {HTMLDialogElement} dialog
 * @param {() => *} readResult - Reads the confirmed result when OK is pressed.
 * @param {*} cancelValue
 * @returns {Promise<*>}
 */
const runDialog = async (doc, dialog, readResult, cancelValue) => {
    let result = cancelValue;
    dialog.querySelector('[data-role="cancel"]').addEventListener('click', () => dialog.close());
    dialog.querySelector('[data-role="ok"]').addEventListener('click', () => {
        result = readResult();
        dialog.close();
    });
    doc.body.appendChild(dialog);
    try {
        await dialog.showModal();
    }
    catch (_error) {
        // showModal rejects when the user presses Escape or closes the dialog window.
        result = cancelValue;
    }
    finally {
        dialog.remove();
    }
    return result;
};

/**
 * Builds the button row for a dialog.
 * @param {Document} doc
 * @param {string} okLabel
 * @param {string} okVariant - Spectrum button variant.
 * @returns {HTMLElement}
 */
const buttonRow = (doc, okLabel, okVariant) => element(doc, 'div', { class : 'dialog-buttons' }, [
    element(doc, 'sp-button', { variant : 'secondary', 'data-role' : 'cancel' }, ['Cancel']),
    element(doc, 'sp-button', { variant : okVariant, 'data-role' : 'ok' }, [okLabel]),
]);

/**
 * Asks for a session name and/or description.
 * @param {Document} doc
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.okLabel
 * @param {string} [options.name] - Initial name; omit to hide the name field.
 * @param {string} [options.description] - Initial description; omit to hide the description field.
 * @param {string} [options.note] - Explanatory text under the fields.
 * @returns {Promise<{ name?: string, description?: string }|null>} Null when cancelled.
 */
const promptSessionDetails = (doc, { title, okLabel, name, description, note }) => {
    const fields = [];
    let nameField;
    let descriptionField;
    if (name !== undefined) {
        nameField = element(doc, 'sp-textfield', { value : name, class : 'dialog-field', placeholder : 'Session name' });
        fields.push(element(doc, 'sp-label', {}, ['Name']), nameField);
    }
    if (description !== undefined) {
        descriptionField = element(doc, 'sp-textarea', { value : description, class : 'dialog-field', placeholder : 'Optional' });
        fields.push(element(doc, 'sp-label', {}, ['Description']), descriptionField);
    }
    if (note) {
        fields.push(element(doc, 'sp-body', { size : 'S', class : 'dialog-note' }, [note]));
    }
    const buttons = buttonRow(doc, okLabel, 'cta');
    const dialog  = element(doc, 'dialog', { class : 'sessions-dialog' }, [
        element(doc, 'sp-heading', { size : 'XS' }, [title]),
        element(doc, 'div', { class : 'dialog-body' }, fields),
        buttons,
    ]);
    if (nameField) {
        // A session must have a name; OK stays disabled while the trimmed name is empty.
        const okButton  = buttons.querySelector('[data-role="ok"]');
        const syncState = () => {
            if (nameField.value.trim() === '') {
                okButton.setAttribute('disabled', '');
            }
            else {
                okButton.removeAttribute('disabled');
            }
        };
        nameField.addEventListener('input', syncState);
        syncState();
    }
    const readResult = () => {
        const values = {};
        if (nameField) {
            values.name = nameField.value;
        }
        if (descriptionField) {
            values.description = descriptionField.value;
        }
        return values;
    };
    return runDialog(doc, dialog, readResult, null);
};

/**
 * Asks the user to confirm an action.
 * @param {Document} doc
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} options.okLabel
 * @param {boolean} [options.destructive=false] - Styles the OK button as a warning.
 * @returns {Promise<boolean>}
 */
const confirmAction = (doc, { title, message, okLabel, destructive = false }) => {
    const dialog = element(doc, 'dialog', { class : 'sessions-dialog' }, [
        element(doc, 'sp-heading', { size : 'XS' }, [title]),
        element(doc, 'sp-body', { size : 'S', class : 'dialog-body' }, [message]),
        buttonRow(doc, okLabel, destructive ? 'warning' : 'cta'),
    ]);
    return runDialog(doc, dialog, () => true, false);
};

module.exports = {
    confirmAction,
    promptSessionDetails,
};
