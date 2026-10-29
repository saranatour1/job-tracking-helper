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
    ignorePatterns: ["src/routeTree.gen.ts", "convex/_generated", "convex/*/_generated"],
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
            {
              name: "convex/react",
              importNames: ["useQuery", "usePaginatedQuery", "useQueries"],
              message:
                "Import it from convex-helpers/react/cache/hooks, so a page you come back to keeps its data.",
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
      // Preferences, Loops, Jobs, Account and Inbox keep state in the form, the URL or an action's result,
      // and read inputs through refs, so they don't need useState either.
      {
        files: [
          "src/features/preferences/**",
          "src/features/loops/**",
          "src/features/jobs/**",
          "src/features/account/**",
          "src/features/inbox/**",
        ],
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
                {
                  name: "convex/react",
                  importNames: ["useQuery", "usePaginatedQuery", "useQueries"],
                  message:
                    "Import it from convex-helpers/react/cache/hooks, so a page you come back to keeps its data.",
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
    // Convex writes these, for the app and for each local component.
    ignorePatterns: ["src/routeTree.gen.ts", "convex/_generated", "convex/*/_generated"],
  },
})
