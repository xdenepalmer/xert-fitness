import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginUnusedImports from "eslint-plugin-unused-imports";

export default [
  // Flat config does not read .gitignore; this object has only `ignores`, so
  // ESLint treats it as a global ignore for every config that follows.
  {
    ignores: ["dist/**", "coverage/**"],
  },
  {
    files: ["**/*.{js,mjs,cjs,jsx}"],
    ...pluginJs.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: [
      "api/**/*.js",
      "scripts/**/*.mjs",
      "test/**/*.js",
      "*.config.js",
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["public/**/*.js"],
    languageOptions: {
      globals: globals.serviceworker,
    },
  },
  {
    files: ["**/*.jsx"],
    plugins: {
      react: pluginReact,
      "react-hooks": pluginReactHooks,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      ...pluginReact.configs.flat.recommended.rules,
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      // Apostrophes read better unescaped in body copy. `>` and `}` are the
      // ones that signal a genuinely mistyped expression or tag.
      "react/no-unescaped-entities": ["error", { forbid: [">", "}"] }],
      "react/no-unknown-property": [
        "error",
        { ignore: ["cmdk-input-wrapper", "toast-close"] },
      ],
      "react-hooks/rules-of-hooks": "error",
    },
  },
  {
    files: ["**/*.{js,mjs,cjs,jsx}"],
    plugins: {
      "unused-imports": pluginUnusedImports,
    },
    rules: {
      "no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
    },
  },
];
