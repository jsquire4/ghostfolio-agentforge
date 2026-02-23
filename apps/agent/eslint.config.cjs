const baseConfig = require('../../eslint.config.cjs');

module.exports = [
  {
    ignores: ['**/dist']
  },
  ...baseConfig,
  {
    rules: {}
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {},
    languageOptions: {
      parserOptions: {
        project: ['apps/agent/tsconfig.*?.json']
      }
    }
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {}
  },
  {
    files: ['**/*.js', '**/*.jsx'],
    rules: {}
  }
];
