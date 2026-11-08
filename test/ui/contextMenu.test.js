const { nextItemIndex, placeMenu } = require('../../src/ui/contextMenu.js');

const kPANEL = { width : 280, height : 380 };
const kMENU  = { width : 160, height : 150 };

describe('placeMenu', () => {
    test('opens at the pointer when the menu fits', () => {
        // Scenario: right-click on a session near the top-left of the panel.
        expect(placeMenu({ x : 40, y : 60 }, kMENU, kPANEL)).toEqual({ left : 40, top : 60 });
    });

    test('shifts left to stay inside the right edge', () => {
        // Scenario: right-click near the right edge of a narrow docked panel.
        expect(placeMenu({ x : 250, y : 60 }, kMENU, kPANEL)).toEqual({ left : 120, top : 60 });
    });

    test('opens upward when it would overflow the bottom edge', () => {
        // Scenario: right-click on the last session in a full list.
        expect(placeMenu({ x : 40, y : 300 }, kMENU, kPANEL)).toEqual({ left : 40, top : 150 });
    });

    test('opens exactly at the pointer when it ends on the bottom edge', () => {
        // Scenario: boundary between fitting and overflowing.
        expect(placeMenu({ x : 40, y : 230 }, kMENU, kPANEL)).toEqual({ left : 40, top : 230 });
    });

    test('pins to the top-left when the panel is smaller than the menu', () => {
        // Scenario: a collapsed panel shorter and narrower than the menu.
        expect(placeMenu({ x : 100, y : 100 }, kMENU, { width : 120, height : 120 })).toEqual({ left : 0, top : 0 });
    });
});

describe('nextItemIndex', () => {
    test.each([
        ['ArrowDown moves to the next item', 0, 'ArrowDown', 1],
        ['ArrowDown wraps from the last item to the first', 5, 'ArrowDown', 0],
        ['ArrowUp moves to the previous item', 3, 'ArrowUp', 2],
        ['ArrowUp wraps from the first item to the last', 0, 'ArrowUp', 5],
        ['ArrowDown with nothing focused starts at the first item', -1, 'ArrowDown', 0],
        ['ArrowUp with nothing focused starts at the last item', -1, 'ArrowUp', 5],
        ['Home jumps to the first item', 4, 'Home', 0],
        ['End jumps to the last item', 1, 'End', 5],
    ])('%s', (_label, current, key, expected) => {
        // Scenario: keyboard navigation through the six session menu items.
        expect(nextItemIndex(current, key, 6)).toBe(expected);
    });

    test('returns null for keys that do not navigate', () => {
        // Scenario: typing a letter while the menu is open.
        expect(nextItemIndex(2, 'r', 6)).toBeNull();
    });
});
