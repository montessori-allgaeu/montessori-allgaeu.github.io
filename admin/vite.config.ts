import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { profileThumbnails } from "../scripts/profile-thumbnails.ts";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react(), profileThumbnails(fileURLToPath(new URL("..", import.meta.url)))],
  build: {
    outDir: "../dist-admin",
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api":
        process.env.MONTE_API_TARGET ?? process.env.MONTE_ADMIN_API_URL ?? "http://127.0.0.1:8787",
    },
  },
});
