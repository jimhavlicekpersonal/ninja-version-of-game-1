// ESLint flat config (quality 6). A modest rule set the code passes today: the recommended
// JavaScript and typescript-eslint rules (syntax-level, no type information, so `npm run lint` stays
// fast), with the few rules that duplicate the compiler or fight this codebase's deliberate style
// turned off. TypeScript itself (strict, noUnusedLocals/Parameters) remains the main check.
// Formatting is not linted: .editorconfig sets the basics; see docs/DECISIONS.md (tooling).
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-server/**',
      'coverage/**',
      'node_modules/**',
      'android/**',
      'ios/**',
      'public/**',
      'locales/compiled/**',
      // Frozen battle-rules snapshots: verbatim copies of an old src/gameplay, never edited.
      'server/rules/v*/**',
      'docs/**',
      // Agent and tool worktrees nested inside the checkout.
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      // Pin the root so nested git worktrees (each with a tsconfig) never confuse the parser.
      parserOptions: { tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.browser, ...globals.node },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      // The compiler already reports unused locals and parameters (tsconfig noUnused*).
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
      // Comment-only catch blocks are deliberate ("storage blocked", "already closed").
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Sim code relies on `!` after a lookup it has just checked; the audit tracks the count (quality 7).
      '@typescript-eslint/no-non-null-assertion': 'off',
      // `require` appears only in Node tools that must load CommonJS.
      '@typescript-eslint/no-require-imports': 'off',
      // Control characters in regular expressions are intentional (name and chat sanitising).
      'no-control-regex': 'off',
      // A `let` assigned after a closure that reads it (a forward reference) stays a `let`.
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }],
    },
  },
  {
    // Tests step tuples like `[s, t] = advance(s, t)` and keep the last value unused on purpose.
    files: ['tests/**'],
    rules: { 'no-useless-assignment': 'off' },
  },
  {
    // The service worker template's placeholders are replaced at build time (vite.config.ts serviceWorker).
    files: ['src/backend/pwa/sw.template.js'],
    languageOptions: { globals: { __PRECACHE__: 'readonly' } },
  },
);
