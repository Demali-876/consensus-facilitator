import tseslint from '@typescript-eslint/eslint-plugin'
import parser from '@typescript-eslint/parser'
import prettier from 'eslint-config-prettier'

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // Warn on unused vars — ignore underscore-prefixed intentional ones
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // Allow `any` with a warning — tighten per-file over time
      '@typescript-eslint/no-explicit-any': 'warn',
      // Disallow floating promises
      'no-floating-decimal': 'error',
    },
  },
  prettier,
]
