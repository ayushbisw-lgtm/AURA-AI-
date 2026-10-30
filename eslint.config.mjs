import { defineConfig, globalIgnores } from 'eslint/config';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default defineConfig([
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  globalIgnores(['.next/**', '.next-dev/**', '.next-stale-*/**', 'out/**', 'build/**', 'next-env.d.ts', 'AURA-AI-/**'])
]);
