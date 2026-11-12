import { readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function pruneImageCache(root) {
  const cache = resolve(root, "node_modules/.astro/assets");
  const emitted = new Set(await readdir(resolve(root, "dist/_astro")));
  for (const filename of await readdir(cache)) {
    // Remote image metadata accompanies the cached image with a .json suffix.
    if (
      !emitted.has(filename) &&
      !(filename.endsWith(".json") && emitted.has(filename.slice(0, -5)))
    )
      await rm(resolve(cache, filename), { recursive: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await pruneImageCache(process.cwd());
