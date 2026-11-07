import type {
  ContentCollection,
  ContentData,
  Change,
  JsonValue,
  UploadResult,
} from "../../src/admin/types";
import { api } from "./api";

export async function uploadMedia(
  file: File,
  collection: ContentCollection,
  kind: "image" | "pdf",
  originalValue: JsonValue | undefined,
  mediaVersions: Record<string, string> = {},
): Promise<UploadResult> {
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Diese Datei ist größer als 10 MB. Bitte verkleinere sie vor dem Hochladen.");
  const form = new FormData();
  form.set("file", file);
  form.set(
    "kind",
    kind === "image" ? (collection === "parentCouncil" ? "parentCouncil" : "team") : "downloads",
  );
  // Replacement always refers to the committed version, never to a staged upload.
  if (typeof originalValue === "string" && mediaVersions[originalValue]) {
    form.set("replace", originalValue);
    form.set("baseVersion", mediaVersions[originalValue]);
  }
  return api.request<UploadResult>("/uploads", { method: "POST", body: form });
}

export type PendingMedia = Record<string, { path: string[]; upload: UploadResult }>;

export function mediaValueAt(data: JsonValue | undefined, path: string[]): JsonValue | undefined {
  let value = data;
  for (const part of path) {
    if (value === null || typeof value !== "object") return undefined;
    value = Array.isArray(value) ? value[Number(part)] : value[part];
  }
  return value;
}

export function selectMedia(
  pending: PendingMedia,
  path: string[],
  upload: UploadResult,
): PendingMedia {
  // One pending binary per field and destination. Re-selecting never appends an obsolete upload.
  const next = Object.fromEntries(
    Object.entries(pending).filter(([, item]) => item.upload.value !== upload.value),
  );
  next[JSON.stringify(path)] = { path, upload };
  return next;
}

export function discardMedia(pending: PendingMedia, path: string[]): PendingMedia {
  return Object.fromEntries(
    Object.entries(pending).filter(
      ([, item]) => !path.every((part, index) => item.path[index] === part),
    ),
  );
}

export function activeMedia(pending: PendingMedia, data: ContentData): UploadResult[] {
  return Object.values(pending)
    .filter((item) => mediaValueAt(data, item.path) === item.upload.value)
    .map((item) => item.upload);
}

// A binary belongs either to this local edit or to an immutable publication job.
// Job-bound upload IDs must never be submitted as part of a different job.
export type EditorMedia =
  | { status: "local"; pending: PendingMedia }
  | { status: "bound"; changeId: string; previews: Record<string, string>; values: string[] }
  | {
      status: "reselection";
      pending: PendingMedia;
      previews: Record<string, string>;
      values: string[];
    };

export const localMedia = (): EditorMedia => ({ status: "local", pending: {} });

export function stagedUploads(media: EditorMedia, data: ContentData): UploadResult[] {
  return media.status === "bound" ? [] : activeMedia(media.pending, data);
}

export function mediaPreviews(media: EditorMedia, data: ContentData): Record<string, string> {
  return {
    ...(media.status === "local" ? {} : media.previews),
    ...Object.fromEntries(
      stagedUploads(media, data).map((upload) => [upload.value, upload.previewUrl]),
    ),
  };
}

export function bindMedia(change: Change, data: ContentData, media: EditorMedia): EditorMedia {
  if (change.status === "published") return localMedia();
  const previews = change.saved?.previews ?? mediaPreviews(media, data);
  const hasUploads = change.saved?.hasUploads ?? stagedUploads(media, data).length > 0;
  return {
    status: "bound",
    changeId: change.id,
    previews,
    // Older servers do not supply hasUploads. Preview values still identify their binaries.
    values: hasUploads
      ? [data.file, data.image].filter((value): value is string => typeof value === "string")
      : Object.keys(previews),
  };
}

export function releaseMedia(media: EditorMedia): EditorMedia {
  if (media.status !== "bound") return media;
  return media.values.length
    ? { status: "reselection", pending: {}, previews: media.previews, values: media.values }
    : localMedia();
}

export function needsReselection(media: EditorMedia, data: ContentData): boolean {
  return (
    media.status === "reselection" &&
    media.values.some(
      (value) =>
        (data.file === value || data.image === value) &&
        !stagedUploads(media, data).some((upload) => upload.value === value),
    )
  );
}

export function changeMedia(
  media: EditorMedia,
  path: string[],
  upload?: UploadResult,
): EditorMedia {
  if (media.status === "bound") return media;
  return {
    ...media,
    pending: upload ? selectMedia(media.pending, path, upload) : discardMedia(media.pending, path),
  };
}
