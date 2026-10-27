import { defineConfig } from "vite-plus"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  resolve: { tsconfigPaths: true },
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
