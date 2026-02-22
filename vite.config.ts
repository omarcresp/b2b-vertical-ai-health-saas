import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "#convex": path.resolve(__dirname, "convex"),
    },
  },
  server: {
    proxy: {
      "/ingest": {
        target: "https://us.i.posthog.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ingest/, ""),
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "convex/**/*.{test,spec}.{ts,tsx}",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        // Test infrastructure
        "src/**/*.test.{ts,tsx}",
        "src/**/*.spec.{ts,tsx}",
        "src/test/**",
        "src/main.tsx",
        "src/vite-env.d.ts",
        // Auto-generated (TanStack Router)
        "src/routeTree.gen.ts",
        // Type-only files — no runtime code to execute
        "src/**/*.d.ts",
        "src/features/setup/types.ts",
        // shadcn/ui primitives — CLAUDE.md: don't test untouched primitive behavior
        "src/components/ui/**",
        // Infrastructure boilerplate — require real auth/router runtimes
        "src/ConvexProviderWithAuthKit.tsx",
        "src/router.tsx",
        "src/ErrorBoundary.tsx",
        // i18n initialisation config — not business logic
        "src/i18n/index.ts",
        // Thin route wrapper files — tested implicitly via integration tests
        "src/routes/_authed/app.appointments.tsx",
        "src/routes/_authed/app.setup.tsx",
        "src/routes/_authed/app.snapshot.tsx",
      ],
    },
  },
});
