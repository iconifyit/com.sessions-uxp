/**
 * A panel-drawn menu shown at the pointer when a session is right-clicked (ADR-001 §5).
 * UXP gives panel content no native context-menu API, so the menu is ordinary markup.
 */

/**
 * Places a menu at a point, keeping it inside the panel: it shifts left when it would
 * overflow the right edge and opens upward when it would overflow the bottom edge.
 * @param {{ x: number, y: number }} point - Pointer position in panel coordinates.
 * @param {{ width: number, height: number }} menu - Rendered menu size.
 * @param {{ width: number, height: number }} bounds - Panel size.
 * @returns {{ left: number, top: number }}
 * @example
 * placeMenu({ x: 250, y: 40 }, { width: 160, height: 150 }, { width: 280, height: 380 }); // => { left: 120, top: 40 }
 */
const placeMenu = (point, menu, bounds) => {
    const left = Math.max(0, Math.min(point.x, bounds.width - menu.width));
    let top    = point.y;
    if (point.y + menu.height > bounds.height) {
        top = Math.max(0, point.y - menu.height);
    }
    return { left, top };
};

/**
 * Computes the item to focus after a navigation key, wrapping at either end.
 * @param {number} current - Index of the focused item, or -1 when none is focused.
 * @param {string} key - `KeyboardEvent.key`.
 * @param {number} count - Number of items.
 * @returns {number|null} The index to focus, or null when the key does not navigate.
 */
const nextItemIndex = (current, key, count) => {
    if (key === 'Home') {
        return 0;
    }
    if (key === 'End') {
        return count - 1;
    }
    if (key === 'ArrowDown') {
        return current < 0 ? 0 : (current + 1) % count;
    }
    if (key === 'ArrowUp') {
        return current < 0 ? count - 1 : (current - 1 + count) % count;
    }
    return null;
};

/**
 * The menu element and its show/hide behavior. Choosing an item hides the menu and
 * reports the item's command id.
 */
class ContextMenu {
    /**
     * @param {object} params
     * @param {Document} params.doc
     * @param {HTMLElement} params.container - Element the menu is positioned within.
     * @param {({ id: string, label: string }|{ divider: true })[]} params.items
     * @param {(commandId: string) => void} params.onSelect
     */
    constructor({ doc, container, items, onSelect }) {
        this.container = container;
        this.onSelect  = onSelect;
        this.element   = doc.createElement('div');
        this.element.className = 'context-menu is-hidden';
        this.element.setAttribute('role', 'menu');
        for (const item of items) {
            const node = doc.createElement('div');
            if (item.divider) {
                node.className = 'context-menu-divider';
            }
            else {
                node.className   = 'context-menu-item';
                node.textContent = item.label;
                node.setAttribute('role', 'menuitem');
                node.setAttribute('tabindex', '-1');
                node.setAttribute('data-command', item.id);
            }
            this.element.appendChild(node);
        }
        this.element.addEventListener('click', (event) => this.choose(event.target));
        this.element.addEventListener('keydown', (event) => this.handleKey(event));
        this.items = [...this.element.querySelectorAll('.context-menu-item')];
        this.doc   = doc;
        container.appendChild(this.element);
    }

    /**
     * Shows the menu at a pointer position given in viewport coordinates.
     * @param {{ x: number, y: number }} point
     * @returns {void}
     */
    show(point) {
        this.element.classList.remove('is-hidden');
        const area     = this.container.getBoundingClientRect();
        const menuRect = this.element.getBoundingClientRect();
        const position = placeMenu(
            { x : point.x - area.left, y : point.y - area.top },
            { width : menuRect.width, height : menuRect.height },
            { width : area.width, height : area.height },
        );
        this.element.style.left = `${position.left}px`;
        this.element.style.top  = `${position.top}px`;
        if (this.contains(this.doc.activeElement)) {
            return;
        }
        // Keyboard users start on the first item; focus returns to its origin on close.
        this.returnFocusTo = this.doc.activeElement;
        this.focusItem(0);
    }

    /**
     * Hides the menu and returns focus to where it was before the menu opened.
     * @returns {void}
     */
    hide() {
        if (this.element.classList.contains('is-hidden')) {
            return;
        }
        this.element.classList.add('is-hidden');
        const origin = this.returnFocusTo;
        this.returnFocusTo = null;
        if (origin && typeof origin.focus === 'function') {
            origin.focus();
        }
    }

    /**
     * Keyboard handling inside the menu: arrows, Home, and End move focus; Enter and Space
     * choose the focused item; Escape and Tab close the menu.
     * @param {KeyboardEvent} event
     * @returns {void}
     */
    handleKey(event) {
        if (event.key === 'Escape' || event.key === 'Tab') {
            event.preventDefault();
            this.hide();
            return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.choose(this.doc.activeElement);
            return;
        }
        const next = nextItemIndex(this.items.indexOf(this.doc.activeElement), event.key, this.items.length);
        if (next !== null) {
            event.preventDefault();
            this.focusItem(next);
        }
    }

    /**
     * Moves keyboard focus to an item.
     * @param {number} index
     * @returns {void}
     */
    focusItem(index) {
        const item = this.items[index];
        if (item && typeof item.focus === 'function') {
            item.focus();
        }
    }

    /**
     * Returns true when the node is inside the menu.
     * @param {Node} node
     * @returns {boolean}
     */
    contains(node) {
        let current = node;
        while (current) {
            if (current === this.element) {
                return true;
            }
            current = current.parentNode;
        }
        return false;
    }

    /**
     * Handles a click inside the menu: an item hides the menu and reports its command.
     * @param {Node} target
     * @returns {void}
     */
    choose(target) {
        let current = target;
        while (current && current !== this.element) {
            const commandId = current.getAttribute ? current.getAttribute('data-command') : null;
            if (commandId) {
                this.hide();
                this.onSelect(commandId);
                return;
            }
            current = current.parentNode;
        }
    }
}

module.exports = {
    ContextMenu,
    nextItemIndex,
    placeMenu,
};
