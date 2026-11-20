import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    ignores: [
      ".next/**",
      "generated/**",
      "**/*.d.ts",
      "eslint.config.js",
      "scripts/import-legacy-catalog.mjs",
      "scripts/import-legacy-transactions.mjs",
      "scripts/extract-virtuemart-bundle.mjs",
      "scripts/import-catalog-bundle.mjs",
      "scripts/lib/**",
    ],
  },
  ...nextVitals,
  ...nextTypescript,
  {
    files: ["**/*.ts", "**/*.tsx"],
    ...tseslint.configs.recommendedTypeChecked[0],
    rules: {
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      // Pre-existing cleanup backlog surfaced by the Next 16 / react-hooks v7 bump and
      // typescript-eslint's type-checked config. Kept as warnings so they stay visible
      // without blocking `npm run check`; fix incrementally. (refs/purity remain errors.)
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
]);
