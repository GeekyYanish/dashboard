import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
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
      /**
       * `react-hooks/set-state-in-effect` is a React Compiler rule that assumes
       * a framework-provided way to read external state. This console has three
       * legitimate uses it cannot express otherwise, all of them client-only
       * initialisation at a hydration boundary:
       *
       *   1. Reading localStorage after mount (prefs, the desk's offline queue).
       *     Reading it during render would produce a server/client mismatch.
       *   2. Async data landing from the repository (`useAsync`). Every
       *     repository method is a promise; there is no synchronous snapshot to
       *     hand `useSyncExternalStore`.
       *   3. Feature detection (`navigator.platform` for the ⌘/Ctrl hint).
       *
       * Kept as a warning rather than switched off, so a genuinely accidental
       * render loop still shows up in `npm run lint`. Everything the rule flags
       * today has been reviewed and is one of the three cases above.
       */
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
