import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, expect, test } from "vitest";
import { createProfileThumbnails } from "./profile-thumbnails";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("erzeugt kleine WebP-Dateien für beide Profilbereiche mit passenden Git-Versionen", async () => {
  const root = process.cwd();
  const { manifest, images } = await createProfileThumbnails(root);
  for (const relative of ["team/alexandra-riefle.webp", "parent-council/angela-guenther.webp"]) {
    const file = join(root, "src/assets/images", relative);
    const version = execFileSync("git", ["hash-object", file], { encoding: "utf8" }).trim();
    const url = manifest[version];
    expect(url).toMatch(/^\/profile-thumbnails\/[a-f0-9]{64}\.webp$/);
    const image = images.get(url)!;
    expect(await sharp(image).metadata()).toMatchObject({ format: "webp", width: 96, height: 114 });
    expect(image.length).toBeLessThan((await readFile(file)).length / 10);
  }
});

test("ändert die URL bei Fotoersatz unter demselben Pfad und bleibt sonst deterministisch", async () => {
  const root = await mkdtemp(join(tmpdir(), "monte-thumbnails-"));
  roots.push(root);
  await mkdir(join(root, "src/assets/images/team"), { recursive: true });
  await mkdir(join(root, "src/assets/images/parent-council"), { recursive: true });
  const file = join(root, "src/assets/images/team/person.png");
  const photo = (background: string) =>
    sharp({ create: { width: 300, height: 400, channels: 3, background } })
      .png()
      .toBuffer();
  await writeFile(file, await photo("red"));
  const first = await createProfileThumbnails(root);
  expect((await createProfileThumbnails(root)).manifest).toEqual(first.manifest);
  await writeFile(file, await photo("blue"));
  const second = await createProfileThumbnails(root);
  expect(Object.keys(second.manifest)).not.toEqual(Object.keys(first.manifest));
  expect(Object.values(second.manifest)).not.toEqual(Object.values(first.manifest));
  expect(second.images.size).toBe(1);
});
