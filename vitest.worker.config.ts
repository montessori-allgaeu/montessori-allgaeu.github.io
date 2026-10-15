import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.admin.jsonc" },
      miniflare: {
        bindings: {
          ADMIN_ORIGIN: "https://verwaltung.example.test",
          RP_ID: "verwaltung.example.test",
        },
      },
    }),
  ],
  test: {
    include: ["worker/**/*.test.ts"],
    exclude: ["worker/**/*.unit.test.ts"],
    testTimeout: 15_000,
  },
});
