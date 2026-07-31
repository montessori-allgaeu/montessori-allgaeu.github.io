import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { getSocialCardAssetPaths } from "./social-card-assets";

export function getSocialCardFingerprintPaths(projectRoot = process.cwd()) {
  const { fonts, logo } = getSocialCardAssetPaths(projectRoot);

  return [
    join(projectRoot, "src/data/social-card.ts"),
    join(projectRoot, "src/data/social-card-assets.ts"),
    logo,
    fonts.unica,
    fonts.krubRegular,
    fonts.krubBold,
    join(projectRoot, "package-lock.json"),
  ];
}

export function getSocialCardTemplateFingerprint(projectRoot = process.cwd()) {
  const hash = createHash("sha256");

  for (const sourcePath of getSocialCardFingerprintPaths(projectRoot)) {
    const stablePath = relative(projectRoot, sourcePath).split(sep).join("/");
    hash.update(stablePath);
    hash.update("\0");
    hash.update(readFileSync(sourcePath));
    hash.update("\0");
  }

  return hash.digest("hex");
}
