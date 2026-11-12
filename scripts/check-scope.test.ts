import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkScope, isContentChange } from "./check-scope";
import { pruneImageCache } from "./prune-image-cache.mjs";

const page = `---
import ImageSplit from "@/components/ImageSplit.astro";
import photo from "@/assets/images/editorial/old.jpg";
const hours = await getHours();
---
<ImageSplit image={photo} alt="Sand" position="72% 42%" mobilePosition="72% 42%">
  <h2>Draußen lernen</h2><p>Ein alter Text.</p><p>{hours.label}</p>
</ImageSplit>
<script>console.log("original");</script>
<style>h2 { color: red; }</style>`;
const filename = "src/pages/kindergarten-schule/kindergarten.astro";
const roots: string[] = [];
async function temporaryDirectory() {
  const root = await mkdtemp(join(tmpdir(), "monte-check-scope-"));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("content-only check scope", () => {
  it("accepts the kindergarten photo replacement, alt text and focal point changes", async () => {
    const changed = page
      .replace("old.jpg", "new.jpg")
      .replace('alt="Sand"', 'alt="Wasser"')
      .replace('position="72% 42%" mobilePosition="72% 42%"', 'position="center"')
      .replace("Ein alter Text.", "Ein neuer Text.");
    expect(await isContentChange(filename, page, changed)).toBe(true);
  });

  it.each([
    ["frontmatter", "getHours()", "getPrivateData()"],
    ["script", 'console.log("original")', 'console.log("changed")'],
    ["style", "color: red", "color: green"],
    ["expression", "hours.label", "hours.secret"],
    ["component import", "@/components/ImageSplit.astro", "@/components/Other.astro"],
    [
      "remote image import",
      "@/assets/images/editorial/old.jpg",
      "https://example.invalid/photo.jpg",
    ],
    ["SVG import", "old.jpg", "new.svg"],
    ["layout attribute", "image={photo}", "image={photo} reverse"],
    ["structure", "<h2>Draußen lernen</h2>", "<h3>Draußen lernen</h3>"],
    ["new script", "<h2>", '<script>alert("new")</script><h2>'],
  ])("requires full checks for changed %s", async (_label, from, to) => {
    expect(await isContentChange(filename, page, page.replace(from, to))).toBe(false);
  });

  it.each([
    "src/content/team/new.yml",
    "src/assets/images/team/new.jpg",
    "public/downloads/new.pdf",
    "docs/bildauswahl.md",
  ])("accepts content file %s", async (path) => {
    expect(await isContentChange(path)).toBe(true);
  });
  it.each([
    "admin/src/App.tsx",
    "worker/src/index.ts",
    "src/admin/content-schemas.ts",
    "src/content.config.ts",
    "package-lock.json",
    ".github/workflows/publish.yml",
    "src/assets/images/new.svg",
    "public/new.js",
  ])("requires full checks for %s", async (path) => {
    expect(await isContentChange(path)).toBe(false);
  });
  it("requires full checks for new or deleted pages", async () => {
    expect(await isContentChange(filename, undefined, page)).toBe(false);
    expect(await isContentChange(filename, page, undefined)).toBe(false);
  });

  async function repository() {
    const root = await temporaryDirectory();
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    git("init", "--quiet");
    git("config", "user.name", "Check scope fixture");
    git("config", "user.email", "scope@example.invalid");
    git("config", "commit.gpgSign", "false");
    git("config", "maintenance.auto", "false");
    git("config", "gc.auto", "0");
    await writeFile(join(root, "README.md"), "Original");
    git("add", ".");
    git("commit", "--quiet", "-m", "Initial");
    return { root, git, base: git("rev-parse", "HEAD") };
  }

  it("includes unvalidated code from earlier commits since the live baseline", async () => {
    const { root, git, base } = await repository();
    await writeFile(join(root, "runtime.ts"), "export const changed = true;");
    git("add", ".");
    git("commit", "--quiet", "-m", "Unpublished code");
    const code = git("rev-parse", "HEAD");
    await writeFile(join(root, "README.md"), "New text");
    git("add", ".");
    git("commit", "--quiet", "-m", "New text");
    expect(await checkScope(root, code)).toBe("content");
    expect(await checkScope(root, base)).toBe("full");
  });

  it("rejects executable files and symlinks even with image extensions", async () => {
    const { root, git, base } = await repository();
    await mkdir(join(root, "src/assets/images"), { recursive: true });
    await symlink("../../../README.md", join(root, "src/assets/images/link.jpg"));
    git("add", ".");
    git("commit", "--quiet", "-m", "Link");
    expect(await checkScope(root, base)).toBe("full");
    await rm(join(root, "src/assets/images/link.jpg"));
    await writeFile(join(root, "src/assets/images/link.jpg"), "image");
    git("add", ".");
    git("update-index", "--chmod=+x", "src/assets/images/link.jpg");
    git("commit", "--quiet", "-m", "Executable");
    expect(await checkScope(root, base)).toBe("full");
  });

  it("falls back to all checks when the baseline cannot be resolved", async () => {
    const { root } = await repository();
    const output = execFileSync(
      process.execPath,
      [
        "--import",
        resolve("node_modules/tsx/dist/loader.mjs"),
        resolve("scripts/check-scope.ts"),
        "missing-baseline",
      ],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    expect(output).toContain("Check scope: full");
  });
});

it("keeps current transformed images and metadata, removes unused cached photos", async () => {
  const root = await temporaryDirectory();
  const cache = join(root, "node_modules/.astro/assets");
  await mkdir(cache, { recursive: true });
  await mkdir(join(root, "dist/_astro"), { recursive: true });
  await writeFile(join(root, "dist/_astro/new.webp"), "new image");
  for (const name of ["new.webp", "new.webp.json", "removed.avif", "removed.avif.json"])
    await writeFile(join(cache, name), name);
  await pruneImageCache(root);
  expect(await readFile(join(cache, "new.webp"), "utf8")).toBe("new.webp");
  expect(await readFile(join(cache, "new.webp.json"), "utf8")).toBe("new.webp.json");
  await expect(readFile(join(cache, "removed.avif"))).rejects.toThrow();
  await expect(readFile(join(cache, "removed.avif.json"))).rejects.toThrow();
});
