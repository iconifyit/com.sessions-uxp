const js      = require('@eslint/js');
const globals = require('globals');

module.exports = [
    {
        ignores : ['node_modules/**', 'dist/**', 'test/host-verification/config.generated.js'],
    },
    js.configs.recommended,
    {
        files           : ['**/*.js'],
        languageOptions : {
            ecmaVersion : 2022,
            sourceType  : 'commonjs',
            globals     : {
                ...globals.node,
                ...globals.browser,
            },
        },
        rules : {
            'no-unused-vars' : ['error', { argsIgnorePattern : '^_', caughtErrorsIgnorePattern : '^_' }],
            'prefer-const'   : 'error',
            'no-var'         : 'error',
            'eqeqeq'         : ['error', 'always'],
        },
    },
    {
        // ES modules, and UXP scripts, which allow top-level await alongside require.
        files           : ['**/*.mjs', '**/*.idjs'],
        languageOptions : {
            ecmaVersion : 2022,
            sourceType  : 'module',
            globals     : globals.node,
        },
        rules : {
            'no-unused-vars' : ['error', { argsIgnorePattern : '^_', caughtErrorsIgnorePattern : '^_' }],
            'prefer-const'   : 'error',
            'no-var'         : 'error',
            'eqeqeq'         : ['error', 'always'],
        },
    },
    {
        files           : ['test/**/*.test.js', 'test/support/**/*.js'],
        languageOptions : {
            globals : globals.jest,
        },
    },
];
