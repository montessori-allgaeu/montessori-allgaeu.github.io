import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import type { Plugin } from "vite";

export async function createProfileThumbnails(root: string) {
  const manifest: Record<string, string> = {};
  const images = new Map<string, Buffer>();
  for (const directory of ["team", "parent-council"]) {
    const folder = join(root, "src/assets/images", directory);
    for (const filename of (await readdir(folder)).sort()) {
      if (!/\.(jpe?g|png|webp)$/i.test(filename)) continue;
      const source = await readFile(join(folder, filename));
      // Match the Git blob versions already returned by /api/content.
      const version = createHash("sha1")
        .update(`blob ${source.length}\0`)
        .update(source)
        .digest("hex");
      const thumbnail = await sharp(source)
        .autoOrient()
        .resize(96, 114, { fit: "cover", position: "centre" })
        .webp({ quality: 75 })
        .toBuffer();
      // Hash the output so changes to the source or renderer cannot reuse stale cache entries.
      const hash = createHash("sha256").update(thumbnail).digest("hex");
      const url = `/profile-thumbnails/${hash}.webp`;
      manifest[version] = url;
      images.set(url, thumbnail);
    }
  }
  return { manifest, images };
}

export async function profileThumbnails(root: string): Promise<Plugin> {
  let generated = await createProfileThumbnails(root);
  return {
    name: "monte-profile-thumbnails",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "profile-thumbnails.json",
        source: JSON.stringify(generated.manifest),
      });
      for (const [url, source] of generated.images)
        this.emitFile({ type: "asset", fileName: url.slice(1), source });
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split("?")[0];
        try {
          if (path === "/profile-thumbnails.json") {
            // Reflect local photo edits when the content is refreshed, without writing generated files.
            generated = await createProfileThumbnails(root);
            response.setHeader("Content-Type", "application/json");
            response.setHeader("Cache-Control", "no-store");
            response.end(JSON.stringify(generated.manifest));
            return;
          }
          const image = path && generated.images.get(path);
          if (!image) return next();
          response.setHeader("Content-Type", "image/webp");
          response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          response.end(image);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}
