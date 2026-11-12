/**
 * Panel script entry, loaded by index.html. Photoshop does not run inline scripts in
 * plugin panels, and a script loaded by `<script src>` resolves `require` from the plugin
 * root, so this root-level file loads the composition root as a module; modules then
 * resolve relative to their own folders in both InDesign and Photoshop.
 */
require('./src/main.js');
