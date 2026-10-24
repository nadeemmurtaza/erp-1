import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  // `next/core-web-vitals` carries only a handful of jsx-a11y rules. The
  // recommended set is the rest — and it is the cheapest large accessibility
  // win available here, because the alternative is hand-written aria with
  // nothing checking it (docs/design/process-governance/09-quality.md ranks it first).
  ...compat.extends('next/core-web-vitals', 'next/typescript', 'plugin:jsx-a11y/recommended'),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // A <label> that wraps both its control and its text satisfies this
      // rule, but the default only looks two elements deep — and a label
      // whose text is `<span><span>{value}</span></span>` is three. Raising
      // the depth stops four correct labels being reported, without
      // accepting a label that has no text at all.
      'jsx-a11y/label-has-associated-control': ['error', { depth: 3 }],
    },
  },
];
