import { defineConfig } from "vite-plus"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // Discovered late, these re-optimize mid-session and load a second React copy.
  optimizeDeps: {
    include: [
      "@convex-dev/auth/react",
      "@convex-dev/auth/methods/username-password/react",
      "@convex-dev/auth/methods/google/react",
      "@convex-dev/auth/methods/github/react",
      "@convex-dev/auth/methods/anonymous/react",
    ],
  },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
  lint: {
    ignorePatterns: ["src/routeTree.gen.ts", "convex/_generated"],
    options: { typeAware: true, typeCheck: true },
    jsPlugins: ["@convex-dev/eslint-plugin"],
    rules: {
      "func-style": ["error", "expression"],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react",
              importNames: ["useEffect", "useLayoutEffect"],
              message: "Derive during render, handle it in the event, or use useSyncExternalStore.",
            },
          ],
        },
      ],
    },
    // shadcn generates these; edits get lost on the next `shadcn add`.
    overrides: [
      // @convex-dev/eslint-plugin's recommended set.
      {
        files: ["convex/**/*.ts"],
        rules: {
          "@convex-dev/no-old-registered-function-syntax": "error",
          "@convex-dev/require-args-validator": "error",
          "@convex-dev/explicit-table-ids": "error",
          "@convex-dev/no-filter-in-query": "warn",
          "@convex-dev/no-top-of-hour-crons": "warn",
          "@convex-dev/no-schema-import-cycle": "error",
          "@convex-dev/no-duplicate-indexes": "error",
          "@convex-dev/no-process-env": "error",
        },
      },
      // Preferences and Loops keep state in the form, the URL or an action's result, and
      // read inputs through refs, so they don't need useState either.
      {
        files: ["src/features/preferences/**", "src/features/loops/**"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              paths: [
                {
                  name: "react",
                  importNames: ["useEffect", "useLayoutEffect", "useState"],
                  message:
                    "Use the form's state, the URL, useActionState for an action's result, or a ref for an input.",
                },
              ],
            },
          ],
        },
      },
      {
        files: ["src/components/ui/**", "src/hooks/use-media-query.ts"],
        rules: { "func-style": "off", "no-restricted-imports": "off" },
      },
    ],
  },
  fmt: {
    semi: false,
    trailingComma: "es5",
    ignorePatterns: ["src/routeTree.gen.ts", "convex/_generated"],
  },
})
