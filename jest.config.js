module.exports = {
  testEnvironment: 'node',
  moduleNameMapper: { '^@crowbartools/firebot-types$': '<rootDir>/tests/firebot-api-mock.ts' },
  testMatch: ['**/tests/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
    '^.+\\.html$': '<rootDir>/tests/html-transform.cjs',
  }
};
