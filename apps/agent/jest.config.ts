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
  testEnvironment: 'node',
  preset: '../../jest.preset.js'
};
