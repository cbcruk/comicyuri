import { defineConfig } from 'vite-plus'

import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

// `repos/foldkit` is a vendored git subtree kept byte-identical to its release
// tag, so it is excluded from every check this project runs over its own code.
const VENDORED = ['repos/**', 'dist/**']

export default defineConfig({
  plugins: [tailwindcss(), foldkit({ devToolsMcpPort: 9988 })],
  optimizeDeps: {
    entries: ['src/entry.ts'],
  },
  staged: {
    '*': 'vp check --fix',
  },
  fmt: {
    semi: false,
    singleQuote: true,
    ignorePatterns: VENDORED,
  },
  lint: {
    jsPlugins: [
      { name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' },
      { name: 'foldkit', specifier: '@foldkit/oxlint-plugin' },
    ],
    // `@foldkit/oxlint-plugin/recommended.json` ships the rule list separately
    // from the plugin registration, so it is spelled out here.
    rules: {
      'vite-plus/prefer-vite-plus-imports': 'error',
      'typescript/no-explicit-any': 'error',
      'typescript/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      'foldkit/command-binding-matches-name': 'error',
      'foldkit/command-define-pascal-const': 'error',
      'foldkit/got-prefix-requires-submodel-payload': 'error',
      'foldkit/got-submodel-message-name': 'error',
      'foldkit/got-wrapper-carries-only-routing': 'error',
      'foldkit/keyed-required-for-mapped-rows': 'error',
      'foldkit/lazy-view-stable-references': 'error',
      'foldkit/mount-factory-must-use-element': 'error',
      'foldkit/no-array-index-view-keys': 'error',
      'foldkit/no-child-message-construction-in-root': 'error',
      'foldkit/no-disabling-dev-guardrails': 'error',
      'foldkit/no-duplicate-onmount-per-element': 'error',
      'foldkit/no-empty-children-array': 'error',
      'foldkit/no-empty-commands-array': 'error',
      'foldkit/no-empty-object-tagged-call': 'error',
      'foldkit/no-empty-to-parent-out-message': 'error',
      'foldkit/no-hand-rolled-command-struct': 'error',
      'foldkit/no-hardcoded-route-strings': 'error',
      'foldkit/no-impure-call-at-decision-time': 'error',
      'foldkit/no-module-level-mutable-state': 'error',
      'foldkit/no-nonportable-server-globals': 'off',
      'foldkit/no-noop-message': 'error',
      'foldkit/no-raw-dom-event-attributes': 'error',
      'foldkit/no-spread-in-evo': 'error',
      'foldkit/prefer-callable-message-constructor': 'error',
      'foldkit/prefer-effect-module-names': 'error',
      'foldkit/require-rel-for-external-link': 'error',
      'foldkit/selection-submodel-factory-at-module-scope': 'error',
      'foldkit/wrap-child-output-in-got-message': 'error',
    },
    options: { typeAware: true, typeCheck: true },
    ignorePatterns: VENDORED,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'happy-dom',
    setupFiles: ['./src/vitest-setup.ts'],
    server: {
      deps: {
        inline: ['foldkit', '@foldkit/ui'],
      },
    },
  },
})
