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
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
