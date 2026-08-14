import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

// Absolute path to this project's app/ folder, computed from THIS config
// file's location - never from the terminal's current directory.
//
// WHY: the @next/next "no-html-link-for-pages" rule searches for the app's
// pages/app folder relative to where the command was RUN. Running
// `npx eslint <file>` from inside a subfolder (e.g. app/) made it print
// "Pages directory cannot be found..." - a false alarm that looked like a
// broken project. Pinning the rule to the real app folder makes linting
// behave identically from any folder.
const appDir = join(dirname(fileURLToPath(import.meta.url)), "app");

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      "@next/next/no-html-link-for-pages": ["error", appDir],
    },
  },
]);

export default eslintConfig;
