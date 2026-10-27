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
      {
        files: ["src/components/ui/**"],
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
