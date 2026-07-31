import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
})

const eslintConfig = [
  ...compat.config({
    extends: ['next/core-web-vitals'],
  }),
  {
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'coverage/**',
      'prisma/next/**',
      'next-env.d.ts',
    ],
  },
]

export default eslintConfig
