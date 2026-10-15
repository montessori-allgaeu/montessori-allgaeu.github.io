import { requireCondition } from "./http";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const mediaKinds = ["team", "parentCouncil", "downloads"] as const;
export type MediaKind = (typeof mediaKinds)[number];

export function identifyMedia(bytes: Uint8Array): { extension: string; contentType: string } {
  const prefix = new TextDecoder("latin1").decode(bytes.slice(0, 16));
  if (prefix.startsWith("%PDF-")) return { extension: "pdf", contentType: "application/pdf" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return { extension: "jpg", contentType: "image/jpeg" };
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte))
    return { extension: "png", contentType: "image/png" };
  if (prefix.startsWith("RIFF") && prefix.slice(8, 12) === "WEBP")
    return { extension: "webp", contentType: "image/webp" };
  throw new Error("Bitte ein JPG-, PNG-, WebP-Bild oder eine PDF-Datei auswählen.");
}

export function validateUpload(bytes: Uint8Array, kind: MediaKind) {
  requireCondition(
    bytes.byteLength > 0 && bytes.byteLength <= MAX_UPLOAD_BYTES,
    413,
    "upload_size",
    "Dateien dürfen höchstens 10 MB groß sein.",
  );
  let format;
  try {
    format = identifyMedia(bytes);
  } catch {
    requireCondition(false, 400, "upload_format", "Bitte JPG, PNG, WebP oder PDF verwenden.");
  }
  requireCondition(
    (kind === "downloads") === (format.extension === "pdf"),
    400,
    "upload_kind",
    kind === "downloads"
      ? "Bitte eine PDF-Datei auswählen."
      : "Bitte ein JPG-, PNG- oder WebP-Bild auswählen.",
  );
  return format;
}

export function newMediaPath(kind: MediaKind, filename: string, id: string, extension: string) {
  const stem =
    filename
      .replace(/\.[^.]*$/, "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "datei";
  const directory =
    kind === "downloads"
      ? "public/downloads"
      : `src/assets/images/${kind === "team" ? "team" : "parent-council"}`;
  return `${directory}/${stem}-${id.slice(0, 8)}.${extension}`;
}

export function mediaValue(path: string, kind: MediaKind) {
  return kind === "downloads" ? path.replace(/^public/, "") : path.replace(/^src\//, "../../");
}

export function validateMedia(bytes: Uint8Array, path: string, contentType: string): void {
  const kind = path.startsWith("public/downloads/")
    ? "downloads"
    : path.startsWith("src/assets/images/team/")
      ? "team"
      : "parentCouncil";
  requireCondition(
    /^(public\/downloads\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.pdf|src\/assets\/images\/(team|parent-council)\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(jpe?g|png|webp))$/i.test(
      path,
    ),
    400,
    "media_path",
    "Ungültiger Medienpfad.",
  );
  const format = validateUpload(bytes, kind);
  const extension = path.split(".").at(-1)?.toLowerCase().replace("jpeg", "jpg");
  requireCondition(
    extension === format.extension && contentType === format.contentType,
    400,
    "media_mismatch",
    "Dateiendung und Dateiinhalt passen nicht zusammen.",
  );
}
