/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/generated/**', '!src/**/*.spec.ts'],
  coverageDirectory: 'coverage',
  // Prisma opens a pool; without this Jest reports open handles on exit.
  forceExit: true,
  testTimeout: 30_000,
  // The end-to-end suites share ONE database and mutate the same seeded rows —
  // stock levels, the demo customer's cart, contacts. Run them one at a time;
  // in parallel they interfere and fail intermittently, which is worse than
  // slow because it teaches everyone to re-run a red build.
  maxWorkers: 1,
};
