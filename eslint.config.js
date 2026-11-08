const js      = require('@eslint/js');
const globals = require('globals');

module.exports = [
    {
        ignores : ['node_modules/**', 'test/host-verification/config.generated.js'],
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
            'no-unused-vars' : ['error', { argsIgnorePattern : '^_' }],
            'prefer-const'   : 'error',
            'no-var'         : 'error',
            'eqeqeq'         : ['error', 'always'],
        },
    },
    {
        files           : ['**/*.mjs'],
        languageOptions : {
            ecmaVersion : 2022,
            sourceType  : 'module',
            globals     : globals.node,
        },
    },
    {
        files           : ['test/**/*.test.js', 'test/support/**/*.js'],
        languageOptions : {
            globals : globals.jest,
        },
    },
];
