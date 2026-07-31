import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getSocialCardFingerprintPaths,
  getSocialCardTemplateFingerprint,
} from "./social-card-fingerprint";

function createFixture(projectRoot: string) {
  for (const sourcePath of getSocialCardFingerprintPaths(projectRoot)) {
    mkdirSync(dirname(sourcePath), { recursive: true });
    writeFileSync(sourcePath, `content:${relative(projectRoot, sourcePath)}`);
  }
}

describe("social card template fingerprint", () => {
  it("tracks the renderer, asset configuration, logo, fonts and dependency lock", () => {
    const projectRoot = "/project";

    expect(
      getSocialCardFingerprintPaths(projectRoot).map((sourcePath) =>
        relative(projectRoot, sourcePath).split("\\").join("/"),
      ),
    ).toEqual([
      "src/data/social-card.ts",
      "src/data/social-card-assets.ts",
      "src/assets/brand/official/logo-montessori-allgaeu-ab-2022.png",
      "node_modules/@fontsource/unica-one/files/unica-one-latin-400-normal.woff",
      "node_modules/@fontsource/krub/files/krub-latin-400-normal.woff",
      "node_modules/@fontsource/krub/files/krub-latin-700-normal.woff",
      "package-lock.json",
    ]);
  });

  it("changes when any renderer, logo, font or dependency input changes", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "social-card-fingerprint-"));

    try {
      createFixture(projectRoot);
      const baseline = getSocialCardTemplateFingerprint(projectRoot);

      for (const sourcePath of getSocialCardFingerprintPaths(projectRoot)) {
        const original = `content:${relative(projectRoot, sourcePath)}`;
        writeFileSync(sourcePath, `${original}:changed`);
        expect(getSocialCardTemplateFingerprint(projectRoot), sourcePath).not.toBe(baseline);
        writeFileSync(sourcePath, original);
      }
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("is independent of the absolute checkout path", () => {
    const firstRoot = mkdtempSync(join(tmpdir(), "social-card-fingerprint-a-"));
    const secondRoot = mkdtempSync(join(tmpdir(), "social-card-fingerprint-b-"));

    try {
      createFixture(firstRoot);
      createFixture(secondRoot);

      expect(getSocialCardTemplateFingerprint(firstRoot)).toBe(
        getSocialCardTemplateFingerprint(secondRoot),
      );
    } finally {
      rmSync(firstRoot, { recursive: true, force: true });
      rmSync(secondRoot, { recursive: true, force: true });
    }
  });
});
