import { lstat, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function checkStaticAssets(
  directory,
  limits = { files: 20_000, bytes: 25 * 1024 * 1024 },
) {
  let count = 0;
  let largest = 0;
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile()) {
        count += 1;
        const { size } = await lstat(child);
        largest = Math.max(largest, size);
        if (size > limits.bytes)
          throw new Error(`Cloudflare-Free-Dateigrenze überschritten: ${child}`);
        if (count > limits.files)
          throw new Error(`Cloudflare-Free-Dateianzahl überschritten: ${directory}`);
      } else throw new Error(`Nicht unterstützter Asset-Typ: ${child}`);
    }
  }
  await walk(directory);
  if (count === 0) throw new Error(`Keine statischen Dateien vorhanden: ${directory}`);
  return { files: count, largestBytes: largest };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  for (const directory of process.argv.slice(2).length
    ? process.argv.slice(2)
    : ["dist", "dist-admin"]) {
    const result = await checkStaticAssets(directory);
    process.stdout.write(
      `${directory}: ${result.files} Dateien, größte Datei ${result.largestBytes} Bytes; innerhalb Cloudflare Free.\n`,
    );
  }
}
