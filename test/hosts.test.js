const { selectHost }         = require('../src/hosts.js');
const { InDesignDocuments }  = require('../src/host/InDesignDocuments.js');
const { PhotoshopDocuments } = require('../src/host/PhotoshopDocuments.js');
const { fakeApp }            = require('./support/fakeInDesign.js');
const { fakePhotoshop }      = require('./support/fakePhotoshop.js');

/**
 * A requireHost stub that serves only the given modules and records every request.
 * @param {object} modules - Module name to module object.
 * @returns {Function & { requested: string[] }}
 */
const stubRequire = (modules) => {
    const requireHost = (name) => {
        requireHost.requested.push(name);
        if (!(name in modules)) {
            throw new Error(`Cannot find module '${name}'`);
        }
        return modules[name];
    };
    requireHost.requested = [];
    return requireHost;
};

describe('selectHost', () => {
    test('InDesign keeps its v0.2.0 plugin id and uses the InDesign adapter', () => {
        // Scenario: the panel loads in InDesign, where requiring "photoshop" would throw.
        const requireHost = stubRequire({ indesign : { app : fakeApp() } });
        const selected    = selectHost('InDesign', { requireHost, localFileSystem : {} });

        expect(selected.pluginId).toBe('com.atomic.indesign-sessions');
        expect(selected.documents).toBeInstanceOf(InDesignDocuments);
        expect(requireHost.requested).toEqual(['indesign']);
    });

    test('Photoshop uses its own plugin id and the Photoshop adapter', () => {
        // Scenario: the panel loads in Photoshop, where requiring "indesign" would throw.
        const { app, core, localFileSystem } = fakePhotoshop();
        const requireHost = stubRequire({ photoshop : { app, core } });
        const selected    = selectHost('Photoshop', { requireHost, localFileSystem });

        expect(selected.pluginId).toBe('com.atomic.photoshop-sessions');
        expect(selected.documents).toBeInstanceOf(PhotoshopDocuments);
        expect(requireHost.requested).toEqual(['photoshop']);
    });

    test('an unsupported host fails loudly without loading any host module', () => {
        // Scenario: the plugin is somehow loaded in Illustrator.
        const requireHost = stubRequire({});
        expect(() => selectHost('Illustrator', { requireHost, localFileSystem : {} })).toThrow('Sessions does not support the host "Illustrator".');
        expect(requireHost.requested).toEqual([]);
    });
});
