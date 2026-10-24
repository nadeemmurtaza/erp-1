import base from '@newax/config/eslint';

export default [
  ...base,
  {
    ignores: ['dist/**', 'coverage/**', 'src/generated/**', 'prisma/schema/migrations/**'],
  },
  {
    rules: {
      // Nest resolves constructor parameter types at runtime through decorator
      // metadata, so interfaces used only as types are still "used".
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
  {
    /*
     * Test doubles may be `any`, and stating that here is more honest than
     * leaving twenty-two standing warnings nobody intends to act on.
     *
     * A mock is a stub, not a contract: these are partial — three methods of
     * PrismaService, one of SettingsService — so `jest.Mocked<T>` would
     * demand the entire surface of a class the test deliberately does not
     * exercise. The type that matters is the one on the code under test, and
     * that stays checked.
     *
     * Production code gets no such exemption. The `as any` casts that used to
     * sit in cart, orders and stitching were removed rather than excused, and
     * one of them was hiding a real bug.
     */
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
