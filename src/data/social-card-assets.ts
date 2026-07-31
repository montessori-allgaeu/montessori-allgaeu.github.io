import { join } from "node:path";

export function getSocialCardAssetPaths(projectRoot = process.cwd()) {
  return {
    fonts: {
      unica: join(
        projectRoot,
        "node_modules/@fontsource/unica-one/files/unica-one-latin-400-normal.woff",
      ),
      krubRegular: join(
        projectRoot,
        "node_modules/@fontsource/krub/files/krub-latin-400-normal.woff",
      ),
      krubBold: join(projectRoot, "node_modules/@fontsource/krub/files/krub-latin-700-normal.woff"),
    },
    logo: join(projectRoot, "src/assets/brand/official/logo-montessori-allgaeu-ab-2022.png"),
  };
}
