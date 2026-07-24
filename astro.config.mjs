import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { legacyRedirects } from "./src/data/legacy.ts";
import { getSitemapLastModified } from "./src/data/sitemap-lastmod.ts";

const siteUrl = "https://montessori-allgaeu.de";
const legacyPaths = new Set(
  Object.keys(legacyRedirects).map((path) => new URL(`/${path}/`, siteUrl).pathname),
);
const hiddenPaths = new Set([...legacyPaths, "/redaktion/"]);
const isHiddenPath = (pathname) => hiddenPaths.has(pathname) || pathname.startsWith("/social/");

export default defineConfig({
  site: siteUrl,
  output: "static",
  trailingSlash: "always",
  integrations: [
    sitemap({
      filter: (page) => !isHiddenPath(new URL(page).pathname),
      serialize: (item) => ({
        ...item,
        lastmod: getSitemapLastModified(item.url),
      }),
    }),
  ],
  vite: {
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
    },
  },
});
