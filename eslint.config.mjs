import {defineConfig,globalIgnores} from 'eslint/config';
import react from 'eslint-plugin-react';
import hooks from 'eslint-plugin-react-hooks';
export default defineConfig([
 globalIgnores(['.next/**','.vercel/**','out/**','build/**','next-env.d.ts']),
 {files:['src/**/*.{js,jsx}','tests/**/*.mjs','scripts/**/*.mjs'],languageOptions:{parserOptions:{ecmaVersion:'latest',sourceType:'module',ecmaFeatures:{jsx:true}}},plugins:{react,'react-hooks':hooks},settings:{react:{version:'detect'}},rules:{...react.configs.recommended.rules,...hooks.configs.recommended.rules,'react/react-in-jsx-scope':'off','react/prop-types':'off'}},
]);
