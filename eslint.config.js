import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Code quality. Downgraded to warn while a follow-up wave removes the
      // accumulated unused imports/vars (~108 instances post-component-export
      // cleanup). Underscore-prefix ignore-pattern preserved so intentional
      // unused vars (e.g. destructured rest) stay silent.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      // React Compiler-aware rules introduced in eslint-plugin-react-hooks 7.x.
      // The Co-Exist codebase predates React Compiler adoption; these are advisory
      // rather than bug-detectors for non-compiled code. Downgraded to warn so they
      // surface in editor + lint output without blocking CI. Re-enable to error after
      // a deliberate React Compiler enablement pass.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      // exhaustive-deps + no-explicit-any: legitimate signal but high false-positive
      // rate in this codebase's third-party integration code (Capacitor, Supabase
      // typegen, Leaflet). Surface as warn while a follow-up cleanup wave addresses
      // them per-call-site with eslint-disable-next-line + reasoning.
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
])
