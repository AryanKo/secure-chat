// This is the ESLint configuration file.
// ESLint helps find and fix problems in JavaScript and JSX code.

import js from '@eslint/js'; // Imports recommended JavaScript rules
import globals from 'globals'; // Imports definitions for global variables (like 'browser')
import reactHooks from 'eslint-plugin-react-hooks'; // Imports rules for React Hooks
import reactRefresh from 'eslint-plugin-react-refresh'; // Imports rules for React Fast Refresh
import { defineConfig, globalIgnores } from 'eslint/config'; // Imports ESLint configuration helpers

export default defineConfig([
  // Global ignores are defined here.
  // Files or directories listed here will be ignored by ESLint.
  globalIgnores(['dist']), // Ignores the 'dist' (build output) folder

  {
    // This configuration applies to all JavaScript and JSX files.
    files: ['**/*.{js,jsx}'],

    // Extends recommended rule sets.
    // These include general JavaScript best practices and React-specific rules.
    extends: [
      js.configs.recommended, // ESLint's recommended JavaScript rules
      reactHooks.configs['recommended-latest'], // Recommended rules for React Hooks
      reactRefresh.configs.vite, // Rules specific to React Fast Refresh with Vite
    ],

    // Language options are configured here.
    languageOptions: {
      ecmaVersion: 2020, // Sets the ECMAScript version for parsing
      globals: globals.browser, // Defines browser global variables (e.g., window, document)
      parserOptions: {
        ecmaVersion: 'latest', // Uses the latest ECMAScript version for parsing
        ecmaFeatures: { jsx: true }, // Enables JSX syntax parsing
        sourceType: 'module', // Indicates that the code is an ES module
      },
    },

    // Specific rules can be overridden or added here.
    rules: {
      // 'no-unused-vars' rule is configured.
      // It flags variables that are declared but not used.
      // 'varsIgnorePattern: '^[A-Z_]'' ignores variables starting with uppercase letters or underscore,
      // which is common for React components or constants.
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
]);
