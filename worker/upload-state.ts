import type { Publication } from "./publication-state";
import { publicationFinished } from "./publication-state";
import { requireCondition } from "./http";

type UploadData = {
  id: string;
  ownerId: string;
  path: string;
  sha256: string;
  size: number;
  contentType: string;
  baseVersion: string | null;
  replacement?: { path: string; baseVersion: string };
  createdAt: number;
};
export type Upload = UploadData & {
  ownership: { kind: "staged" } | { kind: "bound"; changeId: string };
};
export type StoredUpload = UploadData & { changeId?: string };

export function decodeUpload({ changeId, ...data }: StoredUpload): Upload {
  return { ...data, ownership: changeId ? { kind: "bound", changeId } : { kind: "staged" } };
}
export function encodeUpload({ ownership, ...data }: Upload): StoredUpload {
  return { ...data, ...(ownership.kind === "bound" ? { changeId: ownership.changeId } : {}) };
}
export function transitionUpload(
  upload: Upload,
  event: { type: "bind"; ownerId: string; changeId: string },
): Upload {
  requireCondition(
    upload.ownership.kind === "staged" && upload.ownerId === event.ownerId,
    400,
    "upload_missing",
    "Eine hochgeladene Datei ist nicht mehr verfügbar. Bitte erneut hochladen.",
  );
  return { ...upload, ownership: { kind: "bound", changeId: event.changeId } };
}
export function uploadExpired(
  upload: Upload,
  operation: { publication: Publication; updatedAt: string } | undefined,
  now = Date.now(),
) {
  const day = 86400_000;
  if (upload.ownership.kind === "staged") return now - upload.createdAt > day;
  return Boolean(
    operation &&
    publicationFinished(operation.publication) &&
    now - Date.parse(operation.updatedAt) >
      (operation.publication.status === "published" ? day : 7 * day),
  );
}
