import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { format } from "prettier";
import { parse, stringify } from "yaml";
import { z } from "zod";
import {
  contentDefinitions,
  getContentPath,
  mediaRepositoryPath,
  parseContent,
  validateContentSnapshot,
} from "../src/admin/content-model";
import { contentCollections, type ContentSnapshot } from "../src/admin/types";

export const maximumUploadBytes = 10 * 1024 * 1024;
export const changeIdSchema = z.uuid();
export const commitSchema = z.string().regex(/^[a-f0-9]{40}$/);
export const publishOperationSchema = z.strictObject({
  id: changeIdSchema,
  requestId: z.uuid(),
  mutations: z
    .array(
      z.strictObject({
        collection: z.enum(contentCollections),
        id: z.string(),
        baseVersion: commitSchema.nullable(),
        data: z.record(z.string(), z.unknown()),
      }),
    )
    .min(1)
    .max(200),
  uploads: z
    .array(
      z.strictObject({
        id: z.uuid(),
        path: z.string(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        size: z.number().int().positive().max(maximumUploadBytes),
        contentType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
        baseVersion: commitSchema.nullable(),
        replacement: z.strictObject({ path: z.string(), baseVersion: commitSchema }).optional(),
      }),
    )
    .max(50),
  commit: commitSchema.optional(),
});
export type PublishOperation = z.infer<typeof publishOperationSchema>;
export type PublishUpload = PublishOperation["uploads"][number];

export class PublishConflict extends Error {
  constructor(
    message = "Inzwischen wurde die Website geändert. Bitte den aktuellen Stand laden und erneut speichern.",
  ) {
    super(message);
    this.name = "PublishConflict";
  }
}

// A later main commit invalidates this build, but the same immutable change can be retried.
export class StaleRelease extends Error {
  constructor() {
    super(
      "Während der Prüfung wurde main geändert. Die neuere Version wird nicht überschrieben; bitte erneut versuchen.",
    );
    this.name = "StaleRelease";
  }
}

export function git(root: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  }).trimEnd();
}

export function gitEntries(root: string): Map<string, { mode: string; sha: string }> {
  return new Map(
    git(root, ["ls-tree", "-rz", "HEAD"])
      .split("\0")
      .filter(Boolean)
      .map((entry) => {
        const match = /^(\d+) blob ([a-f0-9]{40})\t(.+)$/.exec(entry);
        if (!match) throw new Error("Unbekannter Dateityp im Repository.");
        return [match[3], { mode: match[1], sha: match[2] }];
      }),
  );
}

export async function readContentSnapshot(
  root: string,
): Promise<{ snapshot: ContentSnapshot; media: Map<string, string> }> {
  const entries = gitEntries(root);
  const records: ContentSnapshot["records"] = [];
  for (const definition of contentDefinitions) {
    for (const [path, entry] of entries) {
      if (!path.startsWith(`${definition.directory}/`) || !path.endsWith(".yml")) continue;
      if (
        definition.singleton &&
        path !== getContentPath(definition.collection, definition.singleton)
      )
        continue;
      const id = path.slice(definition.directory.length + 1, -4);
      if (path !== getContentPath(definition.collection, id) || entry.mode !== "100644")
        throw new Error("Ungültige Inhaltsdatei im Repository.");
      records.push({
        collection: definition.collection,
        id,
        version: entry.sha,
        data: parseContent(
          definition.collection,
          id,
          parse(await readFile(join(root, path), "utf8")),
        ),
      });
    }
  }
  const media = new Map(
    [...entries]
      .filter(([, entry]) => entry.mode === "100644")
      .map(([path, entry]) => [path, entry.sha]),
  );
  return { snapshot: { revision: git(root, ["rev-parse", "HEAD"]), records }, media };
}

/** Validate the entire transaction before writing any file. */
export function planOperation(
  operation: PublishOperation,
  snapshot: ContentSnapshot,
  media: ReadonlyMap<string, string>,
) {
  const records = new Map(
    snapshot.records.map((record) => [getContentPath(record.collection, record.id), record]),
  );
  const paths = new Set<string>();
  const referencedMedia = new Set<string>();
  const files = operation.mutations.map((mutation) => {
    const path = getContentPath(mutation.collection, mutation.id);
    if (paths.has(path)) throw new Error("Ein Inhalt wurde mehrfach geändert.");
    paths.add(path);
    const current = records.get(path);
    if ((current?.version ?? null) !== mutation.baseVersion) throw new PublishConflict();
    const data = parseContent(mutation.collection, mutation.id, mutation.data);
    const mediaValue = mutation.collection === "downloads" ? data.file : data.image;
    if (typeof mediaValue === "string")
      referencedMedia.add(mediaRepositoryPath(mutation.collection, mediaValue));
    records.set(path, {
      collection: mutation.collection,
      id: mutation.id,
      version: current?.version ?? "",
      data,
    });
    return { path, data };
  });
  const availableMedia = new Set(media.keys());
  const uploadIds = new Set<string>();
  for (const upload of operation.uploads) {
    if (paths.has(upload.path) || uploadIds.has(upload.id) || !referencedMedia.has(upload.path))
      throw new Error("Eine hochgeladene Datei gehört nicht zu den geänderten Inhalten.");
    if (
      (media.get(upload.path) ?? null) !== upload.baseVersion ||
      (upload.replacement && media.get(upload.replacement.path) !== upload.replacement.baseVersion)
    )
      throw new PublishConflict(
        "Diese Datei wurde inzwischen ersetzt. Bitte den aktuellen Stand laden.",
      );
    paths.add(upload.path);
    uploadIds.add(upload.id);
    availableMedia.add(upload.path);
  }
  validateContentSnapshot({ records: [...records.values()] }, availableMedia);
  return { files, paths: [...paths] };
}

export function assertUploadHash(upload: PublishUpload, bytes: Uint8Array): void {
  if (
    bytes.byteLength !== upload.size ||
    bytes.byteLength > maximumUploadBytes ||
    createHash("sha256").update(bytes).digest("hex") !== upload.sha256
  )
    throw new Error("Die hochgeladene Datei ist unvollständig oder verändert.");
}

export async function safeWrite(
  root: string,
  path: string,
  bytes: string | Uint8Array,
): Promise<void> {
  const absolute = resolve(root, path);
  if (!absolute.startsWith(`${resolve(root)}${sep}`))
    throw new Error("Dateipfad außerhalb des Repositorys.");
  const components = path.split("/");
  for (let index = 1; index <= components.length; index += 1) {
    const part = join(root, ...components.slice(0, index));
    const stat = await lstat(part).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (stat?.isSymbolicLink())
      throw new Error("Verknüpfungen sind als Inhalts- oder Medienpfad nicht erlaubt.");
  }
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, bytes);
}

export async function writeContentFile(root: string, path: string, data: unknown): Promise<void> {
  const yaml = await format(stringify(data, { lineWidth: 0 }), { filepath: path });
  await safeWrite(root, path, yaml);
}

export function findChangeCommit(root: string, id: string, supplied?: string): string | undefined {
  changeIdSchema.parse(id);
  const candidates = supplied
    ? [commitSchema.parse(supplied)]
    : git(root, ["log", "HEAD", "--format=%H", "--fixed-strings", `--grep=Monte-Change: ${id}`])
        .split("\n")
        .filter(Boolean);
  for (const candidate of candidates) {
    git(root, ["merge-base", "--is-ancestor", candidate, "HEAD"]);
    const trailers = git(root, [
      "show",
      "-s",
      "--format=%(trailers:key=Monte-Change,valueonly)",
      candidate,
    ]).split("\n");
    if (trailers.includes(id)) return candidate;
  }
  if (supplied)
    throw new Error("Die gespeicherte Änderung gehört nicht zur aktuellen Versionshistorie.");
  return undefined;
}

export function assertOnlyAllowedChanges(root: string, allowed: ReadonlySet<string>): void {
  const entries = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (!entries) return;
  // Renames/copies have an additional NUL-delimited path; neither is produced by this publisher.
  for (const entry of entries.split("\0").filter(Boolean)) {
    if (/^[RC ]?[RC]/.test(entry.slice(0, 2)) || !allowed.has(entry.slice(3)))
      throw new Error("Die Änderung enthält eine nicht freigegebene Datei.");
  }
}

export function assertCurrentHead(root: string): string {
  const expected = git(root, ["rev-parse", "HEAD"]);
  const current = git(root, ["ls-remote", "origin", "refs/heads/main"]).split(/\s/)[0];
  if (current !== expected) throw new StaleRelease();
  return expected;
}
