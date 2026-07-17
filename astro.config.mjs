import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { legacyRedirects } from "./src/data/legacy.ts";

const siteUrl = "https://montessori-allgaeu.de";
const legacyPaths = new Set(
  Object.keys(legacyRedirects).map((path) => new URL(`/${path}/`, siteUrl).pathname),
);

export default defineConfig({
  site: siteUrl,
  output: "static",
  trailingSlash: "always",
  integrations: [
    sitemap({
      filter: (page) => !legacyPaths.has(new URL(page).pathname),
    }),
  ],
  vite: {
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
    },
  },
});
