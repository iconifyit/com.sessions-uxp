const { InDesignDocuments }  = require('./host/InDesignDocuments.js');
const { PhotoshopDocuments } = require('./host/PhotoshopDocuments.js');

/**
 * The single source of each host's plugin id and documents adapter (ADR-002 §5).
 * The plugin id doubles as the sessions folder name, so the InDesign entry must stay
 * `com.atomic.indesign-sessions` to keep existing sessions visible.
 */
const HOSTS = Object.freeze({
    InDesign : Object.freeze({
        pluginId        : 'com.atomic.indesign-sessions',
        createDocuments : ({ requireHost }) => new InDesignDocuments({ app : requireHost('indesign').app }),
    }),
    Photoshop : Object.freeze({
        pluginId        : 'com.atomic.photoshop-sessions',
        createDocuments : ({ requireHost, localFileSystem }) => {
            const { app, core } = requireHost('photoshop');
            return new PhotoshopDocuments({ app, core, localFileSystem });
        },
    }),
});

/**
 * Selects the running host's plugin id and builds its documents adapter. Host modules are
 * obtained only through `requireHost`, and only for the selected host, because requiring
 * the other host's module throws.
 * @param {string} hostName - `require("uxp").host.name`, for example `InDesign` or `Photoshop`.
 * @param {object} services
 * @param {(moduleName: string) => object} services.requireHost - Loads a host module (`require` in UXP).
 * @param {object} services.localFileSystem - `require("uxp").storage.localFileSystem`.
 * @returns {{ pluginId: string, documents: object }}
 * @throws {Error} When the host is not supported.
 */
const selectHost = (hostName, { requireHost, localFileSystem }) => {
    const host = HOSTS[hostName];
    if (!host) {
        throw new Error(`Sessions does not support the host "${hostName}".`);
    }
    return { pluginId : host.pluginId, documents : host.createDocuments({ requireHost, localFileSystem }) };
};

module.exports = {
    HOSTS,
    selectHost,
};
