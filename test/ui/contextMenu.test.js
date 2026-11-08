const { placeMenu } = require('../../src/ui/contextMenu.js');

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
