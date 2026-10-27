import { defineConfig } from "vite-plus"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // Discovered late, these re-optimize mid-session and load a second React copy.
  optimizeDeps: {
    include: ["@convex-dev/auth/react", "@convex-dev/auth/methods/username-password/react"],
  },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
  lint: {
    ignorePatterns: ["src/routeTree.gen.ts"],
    options: { typeAware: true, typeCheck: true },
  },
  fmt: {
    semi: false,
    trailingComma: "es5",
    ignorePatterns: ["src/routeTree.gen.ts"],
  },
})
