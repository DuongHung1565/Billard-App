module.exports = { testEnvironment: 'node', testMatch: ['**/tests/integration/**/*.test.ts'], testTimeout: 30000, transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.server.json' }] } };
