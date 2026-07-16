import eslintPluginAstro from "eslint-plugin-astro";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: ["dist/**", ".astro/**", ".npm-cache/**", "node_modules/**"],
  },
  ...eslintPluginAstro.configs.recommended,
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
];
