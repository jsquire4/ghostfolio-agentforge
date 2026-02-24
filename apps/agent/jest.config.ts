/* eslint-disable */
export default {
  displayName: 'agent',
  globals: {},
  roots: ['<rootDir>/src'],
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json'
      }
    ]
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/agent',
  collectCoverageFrom: [
    'src/app/**/*.ts',
    '!src/app/**/*.spec.ts',
    '!src/app/**/*.integration.spec.ts',
    '!**/index.ts',
    '!**/main.ts',
    '!**/__mocks__/**',
    '!**/tools.exports.ts',
    '!**/verifiers.exports.ts',
    '!**/test-fixtures/**',
    '!**/agent.service.ts',
    '!**/evals.controller.ts',
    '!**/evals.module.ts',
    '!**/redis-checkpoint.saver.ts',
    '!**/app.module.ts',
    '!**/*.module.ts',
    '!**/interfaces.ts',
    '!**/*.types.ts'
  ],
  testEnvironment: 'node',
  preset: '../../jest.preset.js',
  coverageThreshold: {
    global: {
      lines: 99,
      branches: 92,
      functions: 100,
      statements: 98
    }
  }
};
