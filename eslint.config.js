import globals from 'globals';
import pluginJs from '@eslint/js';

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: ['dist', 'node_modules', 'static', 'migrations'],
  },
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2020,
      },
    },
  },
  pluginJs.configs.recommended,
  {
    rules: {
      // Disable rules that are problematic for our codebase
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
