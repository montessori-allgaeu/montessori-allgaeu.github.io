import { z } from "zod";
import {
  canDeleteContent,
  getContentDefinition,
  getContentPath,
  mediaRepositoryPath,
  parseContent,
  validateContentSnapshot,
} from "../src/admin/content-model";
import {
  contentCollections,
  type AccessUser,
  type Change,
  type ChangeRequest,
  type ContentMutation,
  type EditableContentSnapshot,
  type UploadResult,
} from "../src/admin/types";
import type { Auth, Session } from "./auth";
import type { Env } from "./env";
import { GitHub, verifyRunner } from "./github";
import { boundedBody, hash, HttpError, json, requireCondition } from "./http";
import {
  MAX_UPLOAD_BYTES,
  mediaKinds,
  mediaValue,
  newMediaPath,
  validateMedia,
  validateUpload,
} from "./media";
import { changeSchema, changesBankDetails, requireAdmin, requireFresh } from "./policy";
import { Store } from "./store";
import {
  decodePublication,
  encodePublication,
  initialPublication,
  publicationActive,
  publicationFinished,
  transitionPublication,
  type Publication,
  type StoredPublication,
} from "./publication-state";
import {
  decodeUpload,
  encodeUpload,
  transitionUpload,
  uploadExpired,
  type StoredUpload,
  type Upload,
} from "./upload-state";

type OperationData = Omit<Change, "status" | "error" | "commit" | "runUrl" | "saved" | "retry"> &
  ChangeRequest & {
    ownerId: string;
    dispatchUserId: string;
    fingerprint: string;
    bankChange: boolean;
  };
type Operation = OperationData & { publication: Publication };
type StoredOperation = OperationData & StoredPublication;
const DAY = 86400_000;
const statuses = z.strictObject({
  status: z.enum(["checking", "committed", "published", "failed", "conflict"]),
  commit: z
    .string()
    .regex(/^[0-9a-f]{40}$/)
    .optional(),
  releaseCommit: z
    .string()
    .regex(/^[0-9a-f]{40}$/)
    .optional(),
  error: z.string().max(1000).optional(),
});
export class Publishing {
  constructor(
    private store: Store,
    private env: Env,
    private github: GitHub,
    private auth: Auth,
    private storage: DurableObjectStorage,
  ) {}
  private decodeOperation(row: StoredOperation): Operation {
    const {
      status,
      attempt,
      runId,
      runAttempt,
      dispatchedAt,
      dispatchCount,
      commit,
      releaseCommit,
      error,
      runUrl,
      ...data
    } = row;
    return {
      ...data,
      publication: decodePublication({
        status,
        attempt,
        runId,
        runAttempt,
        dispatchedAt,
        dispatchCount,
        commit,
        releaseCommit,
        error,
        runUrl,
      }),
    };
  }
  private operation(id: string) {
    const row = this.store.get<StoredOperation>(`change:${id}`);
    return row ? this.decodeOperation(row) : undefined;
  }
  private operations() {
    return this.store.list<StoredOperation>("change:").map(([, row]) => this.decodeOperation(row));
  }
  private uploadRecord(id: string) {
    const row = this.store.get<StoredUpload>(`upload:${id}`);
    return row ? decodeUpload(row) : undefined;
  }
  private uploads() {
    return this.store
      .list<StoredUpload>("upload:")
      .map(([key, row]) => [key, decodeUpload(row)] as const);
  }
  private writeUpload(upload: Upload) {
    this.store.put(`upload:${upload.id}`, encodeUpload(upload));
  }
  private write(operation: Operation) {
    operation.updatedAt = new Date().toISOString();
    const { publication, ...data } = operation;
    this.store.put(`change:${operation.id}`, {
      ...data,
      ...encodePublication(publication, this.env.GITHUB_REPOSITORY),
    });
  }
  private requiredUploads(operation: Operation): Upload[] | undefined {
    if (operation.publication.commit) return [];
    const uploads: Upload[] = [];
    for (const id of operation.uploadIds) {
      const upload = this.uploadRecord(id);
      if (
        !upload ||
        upload.ownership.kind !== "bound" ||
        upload.ownership.changeId !== operation.id ||
        uploadExpired(upload, operation)
      )
        return undefined;
      uploads.push(upload);
    }
    return uploads;
  }
  private publicChange(operation: Operation): Change {
    const { id, createdAt, updatedAt, summary } = operation;
    const { status, error, commit, runUrl } = encodePublication(
      operation.publication,
      this.env.GITHUB_REPOSITORY,
    );
    const uploadsExpired = !this.requiredUploads(operation);
    const saved =
      status === "published"
        ? undefined
        : {
            mutations: operation.mutations,
            hasUploads: operation.uploadIds.length > 0,
            uploadsExpired,
            previews: Object.fromEntries(
              operation.uploadIds.flatMap((uploadId) => {
                const upload = this.uploadRecord(uploadId);
                if (!upload) return [];
                const kind = upload.path.startsWith("public/downloads/")
                  ? "downloads"
                  : upload.path.startsWith("src/assets/images/team/")
                    ? "team"
                    : "parentCouncil";
                return [[mediaValue(upload.path, kind), `/api/uploads/${upload.id}`]];
              }),
            ),
          };
    const deleted = operation.mutations.every((mutation) => mutation.delete) ? true : undefined;
    const targets = operation.mutations.map(({ collection, id }) => ({ collection, id }));
    return {
      id,
      status,
      createdAt,
      updatedAt,
      summary,
      error,
      commit,
      runUrl,
      ...(status === "failed"
        ? {
            retry: {
              available: !uploadsExpired,
              ...(uploadsExpired ? { reason: "uploads_expired" as const } : {}),
            },
          }
        : {}),
      targets,
      saved,
      deleted,
    };
  }
  list() {
    return json({
      changes: this.operations()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 50)
        .map((operation) => this.publicChange(operation)),
    });
  }
  async content() {
    const { revision, records, files } = await this.github.snapshot();
    const mediaVersions: Record<string, string> = {};
    for (const record of records) {
      const value = record.collection === "downloads" ? record.data.file : record.data.image;
      if (typeof value !== "string") continue;
      const version = files.get(mediaRepositoryPath(record.collection, value))?.sha;
      if (version) mediaVersions[value] = version;
    }
    return json({ revision, records, mediaVersions } satisfies EditableContentSnapshot);
  }
  async submit(body: unknown, user: AccessUser, session: Session) {
    const input = changeSchema.parse(body);
    const fingerprint = await hash(JSON.stringify(input));
    const previous = this.operations().find(
      (o) => o.ownerId === user.id && o.requestId === input.requestId,
    );
    if (previous) {
      requireCondition(
        previous.fingerprint === fingerprint,
        409,
        "request_reused",
        "Diese Anfragekennung wurde bereits für eine andere Änderung verwendet.",
      );
      return json(this.publicChange(previous));
    }
    this.auth.limit(`changes:${user.id}`, 30, 600_000);
    requireCondition(
      this.operations().filter((o) => !publicationFinished(o.publication)).length < 30,
      429,
      "queue_full",
      "Es sind gerade viele Änderungen in Arbeit. Bitte kurz warten.",
    );
    const current = await this.github.snapshot();
    const paths = new Set<string>();
    let bankChange = false;
    const mutations: ContentMutation[] = input.mutations.map((mutation) => {
      const path = getContentPath(mutation.collection, mutation.id);
      requireCondition(
        !paths.has(path),
        400,
        "duplicate_record",
        "Ein Inhalt wurde doppelt geändert.",
      );
      paths.add(path);
      const before = current.records.find(
        (r) => r.collection === mutation.collection && r.id === mutation.id,
      );
      requireCondition(
        (before?.version ?? null) === mutation.baseVersion,
        409,
        "content_conflict",
        "Dieser Inhalt wurde inzwischen geändert. Bitte neu laden und die Änderung erneut prüfen.",
      );
      requireCondition(
        !mutation.delete || (before && canDeleteContent(mutation)),
        400,
        "deletion_invalid",
        "Dieser Eintrag wird auf der Website benötigt und darf nicht gelöscht werden.",
      );
      const parsed = {
        ...mutation,
        data: mutation.delete
          ? before!.data
          : parseContent(mutation.collection, mutation.id, mutation.data),
      };
      if (changesBankDetails(parsed, before?.data)) {
        requireAdmin(user);
        requireFresh(session.verifiedAt);
        bankChange = true;
      }
      return parsed;
    });
    const uploads = input.uploadIds.map((id) => {
      const upload = this.uploadRecord(id);
      requireCondition(
        upload?.ownerId === user.id &&
          upload.ownership.kind === "staged" &&
          !uploadExpired(upload, undefined),
        400,
        "upload_missing",
        "Eine hochgeladene Datei ist nicht mehr verfügbar. Bitte erneut hochladen.",
      );
      requireCondition(
        (current.files.get(upload.path)?.sha ?? null) === upload.baseVersion &&
          (!upload.replacement ||
            current.files.get(upload.replacement.path)?.sha === upload.replacement.baseVersion),
        409,
        "media_conflict",
        "Diese Datei wurde inzwischen ersetzt. Bitte neu laden.",
      );
      requireCondition(
        mutations.some(
          (m) =>
            !m.delete &&
            ["team", "parentCouncil", "downloads"].includes(m.collection) &&
            (m.data.image ===
              mediaValue(
                upload.path,
                m.collection === "downloads"
                  ? "downloads"
                  : m.collection === "team"
                    ? "team"
                    : "parentCouncil",
              ) ||
              m.data.file === mediaValue(upload.path, "downloads")),
        ),
        400,
        "upload_unused",
        "Eine Datei gehört zu keinem geänderten Eintrag.",
      );
      return upload;
    });
    requireCondition(
      new Set(uploads.map((u) => u.path)).size === uploads.length &&
        new Set(input.uploadIds).size === input.uploadIds.length,
      400,
      "duplicate_media",
      "Bitte jede Datei nur einmal auswählen.",
    );
    const candidate = {
      records: [
        ...current.records.filter((r) => !paths.has(getContentPath(r.collection, r.id))),
        ...mutations.filter((m) => !m.delete).map((m) => ({ ...m, version: m.baseVersion ?? "" })),
      ],
    };
    const media = new Set([...current.files.keys(), ...uploads.map((u) => u.path)]);
    try {
      validateContentSnapshot(candidate, media);
    } catch (error) {
      throw new HttpError(
        400,
        "content_invalid",
        error instanceof Error ? error.message : "Bitte die Inhalte prüfen.",
      );
    }
    const now = new Date().toISOString();
    const areas = [...new Set(mutations.map((m) => getContentDefinition(m.collection).label))];
    const operation: Operation = {
      ...input,
      mutations,
      id: crypto.randomUUID(),
      ownerId: user.id,
      dispatchUserId: user.id,
      publication: initialPublication(),
      createdAt: now,
      updatedAt: now,
      summary: `${areas.join(", ")} · ${mutations.length} ${mutations.length === 1 ? "Eintrag" : "Einträge"}${mutations.every((mutation) => mutation.delete) ? " löschen" : ""}`,
      fingerprint,
      bankChange,
    };
    this.write(operation);
    for (const upload of uploads)
      this.writeUpload(
        transitionUpload(upload, { type: "bind", ownerId: user.id, changeId: operation.id }),
      );
    this.auth.audit(user.id, "content_saved", operation.id);
    await this.storage.setAlarm(Date.now() + 1000);
    return json(this.publicChange(operation), 202);
  }
  async retry(id: string, user: AccessUser, session: Session) {
    const operation = this.operation(id);
    requireCondition(operation, 404, "change_missing", "Änderung nicht gefunden.");
    requireCondition(
      operation.ownerId === user.id || user.role === "admin",
      403,
      "change_owner",
      "Diese Änderung gehört zu einer anderen Person.",
    );
    requireCondition(
      operation.publication.status === "failed",
      409,
      "retry_state",
      operation.publication.status === "conflict"
        ? "Bitte den Inhalt neu laden und den Konflikt auflösen."
        : "Die Veröffentlichung ist bereits in Arbeit oder abgeschlossen.",
    );
    if (operation.bankChange) {
      requireAdmin(user);
      requireFresh(session.verifiedAt);
    }
    const uploads = this.requiredUploads(operation);
    requireCondition(
      uploads,
      410,
      "uploads_expired",
      "Die hochgeladenen Dateien sind nicht mehr verfügbar. Bitte den Inhalt erneut öffnen, die Dateien neu auswählen und speichern.",
    );
    for (const upload of uploads) {
      const bytes = await this.env.UPLOADS.get(upload.id, "arrayBuffer");
      requireCondition(
        bytes && (await hash(bytes)) === upload.sha256,
        410,
        "uploads_expired",
        "Die hochgeladenen Dateien sind nicht mehr verfügbar. Bitte den Inhalt erneut öffnen, die Dateien neu auswählen und speichern.",
      );
    }
    // A retry delegates this already immutable change to the acting user after rechecking access.
    operation.dispatchUserId = user.id;
    operation.publication = transitionPublication(operation.publication, { type: "retry" });
    this.write(operation);
    await this.storage.setAlarm(Date.now() + 1000);
    return json(this.publicChange(operation), 202);
  }
  async upload(request: Request, user: AccessUser): Promise<Response> {
    this.auth.limit(`uploads:${user.id}`, 20, 600_000);
    this.auth.limit("uploads-daily", 300, DAY);
    const bytes = await boundedBody(request, MAX_UPLOAD_BYTES + 64 * 1024);
    let form;
    try {
      form = await new Response(bytes, {
        headers: { "Content-Type": request.headers.get("Content-Type") ?? "" },
      }).formData();
    } catch {
      throw new HttpError(400, "upload_form", "Die Datei konnte nicht gelesen werden.");
    }
    const file = form.get("file");
    const kind = z.enum(mediaKinds).parse(form.get("kind"));
    requireCondition(file instanceof File, 400, "upload_missing", "Bitte eine Datei auswählen.");
    const buffer = await file.arrayBuffer();
    const format = validateUpload(new Uint8Array(buffer), kind);
    const uploads = this.uploads().map(([, u]) => u);
    requireCondition(
      uploads.reduce((size, u) => size + u.size, buffer.byteLength) <= 256 * 1024 * 1024,
      507,
      "upload_quota",
      "Der temporäre Medienspeicher ist voll. Bitte laufende Veröffentlichungen abwarten.",
    );
    const id = crypto.randomUUID();
    const replace = form.get("replace");
    const originalPath =
      typeof replace === "string" && replace ? mediaRepositoryPath(kind, replace) : undefined;
    const snapshot = await this.github.snapshot();
    let replacement: Upload["replacement"];
    if (originalPath) {
      const originalVersion = snapshot.files.get(originalPath)?.sha;
      requireCondition(
        originalVersion,
        409,
        "replace_missing",
        "Die zu ersetzende Datei wurde nicht gefunden.",
      );
      requireCondition(
        form.get("baseVersion") === originalVersion,
        409,
        "media_conflict",
        "Diese Datei wurde zwischenzeitlich geändert. Bitte den Inhalt neu laden.",
      );
      replacement = { path: originalPath, baseVersion: originalVersion };
    }
    const originalExtension = originalPath?.split(".").at(-1)?.toLowerCase().replace("jpeg", "jpg");
    // Keep stable links for same-format replacements; changed formats need their own valid path.
    const path =
      originalPath && originalExtension === format.extension
        ? originalPath
        : newMediaPath(kind, file.name, id, format.extension);
    validateMedia(new Uint8Array(buffer), path, format.contentType);
    const baseVersion = snapshot.files.get(path)?.sha ?? null;
    const upload: Upload = {
      id,
      ownerId: user.id,
      path,
      size: buffer.byteLength,
      sha256: await hash(buffer),
      contentType: format.contentType,
      baseVersion,
      ...(replacement && path !== originalPath ? { replacement } : {}),
      createdAt: Date.now(),
      ownership: { kind: "staged" },
    };
    await this.env.UPLOADS.put(id, buffer);
    this.writeUpload(upload);
    await this.storage.setAlarm(Date.now() + 60_000);
    const result: UploadResult = {
      id,
      value: mediaValue(path, kind),
      previewUrl: `/api/uploads/${id}`,
    };
    return json(result, 201);
  }
  async uploadPreview(id: string, user: AccessUser) {
    const upload = this.uploadRecord(id);
    const change =
      upload?.ownership.kind === "bound" ? this.operation(upload.ownership.changeId) : undefined;
    requireCondition(
      upload &&
        (upload.ownerId === user.id || user.role === "admin" || change?.uploadIds.includes(id)),
      404,
      "upload_missing",
      "Datei nicht gefunden.",
    );
    return this.uploadBytes(upload);
  }
  private async uploadBytes(upload: Upload) {
    const bytes = await this.env.UPLOADS.get(upload.id, "arrayBuffer");
    requireCondition(
      bytes,
      503,
      "upload_pending",
      "Die Datei wird noch übertragen. Bitte gleich erneut versuchen.",
    );
    requireCondition(
      (await hash(bytes)) === upload.sha256,
      503,
      "upload_integrity",
      "Die Datei ist unvollständig. Bitte erneut hochladen.",
    );
    return new Response(bytes, {
      headers: {
        "Content-Type": upload.contentType,
        "Content-Length": String(upload.size),
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename="${upload.path.split("/").at(-1)}"`,
      },
    });
  }
  async media(url: URL) {
    const collection = z.enum(contentCollections).parse(url.searchParams.get("collection"));
    const path = mediaRepositoryPath(collection, url.searchParams.get("path") ?? "");
    const snapshot = await this.github.snapshot();
    const file = snapshot.files.get(path);
    requireCondition(file, 404, "media_missing", "Datei nicht gefunden.");
    const bytes = await this.github.blob(file.sha);
    const ext = path.split(".").at(-1)?.toLowerCase();
    const contentType =
      ext === "pdf"
        ? "application/pdf"
        : ext === "png"
          ? "image/png"
          : ext === "webp"
            ? "image/webp"
            : "image/jpeg";
    return new Response(bytes, {
      headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=60" },
    });
  }
  async runner(request: Request, url: URL, body?: unknown) {
    const match = /^\/api\/publish\/([0-9a-f-]{36})(?:\/(status|uploads\/([0-9a-f-]{36})))?$/.exec(
      url.pathname,
    );
    requireCondition(match, 404, "not_found", "API-Pfad nicht gefunden.");
    const identity = await verifyRunner(request, this.env);
    const operation = this.operation(match[1]);
    requireCondition(
      operation &&
        operation.publication.attempt.kind !== "waiting" &&
        request.headers.get("x-publish-attempt") === operation.publication.attempt.token,
      403,
      "publish_attempt",
      "Dieser Veröffentlichungsversuch ist nicht mehr gültig.",
    );
    requireCondition(
      operation.publication.attempt.kind !== "claimed" ||
        (operation.publication.attempt.runId === identity.runId &&
          operation.publication.attempt.runAttempt === identity.runAttempt),
      409,
      "publish_claimed",
      "Die Änderung wird bereits von einem anderen Lauf verarbeitet.",
    );
    if (operation.publication.attempt.kind !== "claimed") {
      requireCondition(
        request.method === "GET" && !match[2] && operation.publication.status === "queued",
        409,
        "publish_state",
        "Die Veröffentlichung kann nicht übernommen werden.",
      );
      const owner = this.auth.user(operation.dispatchUserId);
      requireCondition(
        owner?.active && (!operation.bankChange || owner.role === "admin"),
        403,
        "publish_owner",
        "Der Zugang für diese Änderung ist nicht mehr berechtigt.",
      );
      operation.publication = transitionPublication(operation.publication, {
        type: "claim",
        ...identity,
      });
      this.write(operation);
    }
    if (request.method === "GET" && !match[2]) {
      requireCondition(
        publicationActive(operation.publication),
        409,
        "publish_state",
        "Diese Änderung ist bereits abgeschlossen.",
      );
      const uploads = (operation.publication.commit ? [] : operation.uploadIds).map((id) => {
        const upload = this.uploadRecord(id);
        requireCondition(
          upload && upload.ownership.kind === "bound" && upload.ownership.changeId === operation.id,
          410,
          "upload_missing",
          "Eine hochgeladene Datei ist abgelaufen. Bitte neu speichern.",
        );
        const { path, sha256, size, contentType, baseVersion, replacement } = upload;
        return { id, path, sha256, size, contentType, baseVersion, replacement };
      });
      return json({
        id: operation.id,
        requestId: operation.requestId,
        mutations: operation.mutations,
        uploads,
        commit: operation.publication.commit,
      });
    }
    if (request.method === "GET" && match[3]) {
      requireCondition(
        operation.uploadIds.includes(match[3]),
        403,
        "upload_scope",
        "Datei gehört nicht zu dieser Änderung.",
      );
      const upload = this.uploadRecord(match[3]);
      requireCondition(upload, 410, "upload_missing", "Datei nicht mehr vorhanden.");
      return this.uploadBytes(upload);
    }
    requireCondition(
      request.method === "POST" && match[2] === "status",
      405,
      "method",
      "Methode nicht erlaubt.",
    );
    const input = statuses.parse(body);
    const next = transitionPublication(operation.publication, {
      type: "report",
      report: {
        ...input,
        error:
          input.status === "failed"
            ? "Die Prüfung oder Veröffentlichung ist fehlgeschlagen. Du kannst es erneut versuchen; Details stehen im verknüpften Prüflauf."
            : input.status === "conflict"
              ? "Der Inhalt wurde während der Prüfung geändert. Bitte neu laden und die Änderung erneut speichern."
              : undefined,
      },
    });
    if (input.status === "published") {
      requireCondition(
        next.status === "published",
        409,
        "publish_state",
        "Die Veröffentlichung ist nicht abgeschlossen.",
      );
      const release = next.releaseCommit;
      requireCondition(release, 400, "release_missing", "Die veröffentlichte Version fehlt.");
      const response = await fetch(`${this.env.PUBLIC_SITE_URL}/version.json?verify=${release}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      const version = z
        .object({ commit: z.string() })
        .safeParse(response.ok ? await response.json() : {});
      requireCondition(
        version.success && version.data.commit === release,
        503,
        "not_live",
        "Die neue Version ist noch nicht auf der Website sichtbar.",
      );
    }
    operation.publication = next;
    this.write(operation);
    await this.storage.setAlarm(Date.now() + 1000);
    return json({ ok: true });
  }
  async tick() {
    this.store.clean();
    const operations = this.operations();
    const active = operations.find((o) => publicationActive(o.publication));
    if (
      active &&
      active.publication.attempt.kind === "claimed" &&
      Date.now() - Date.parse(active.updatedAt) > 120_000
    ) {
      const run = await this.github.run(active.publication.attempt.runId);
      if (run.status === "completed") {
        active.publication = transitionPublication(active.publication, {
          type: "fail",
          error:
            "Der Prüflauf ist beendet, die Veröffentlichung wurde aber nicht bestätigt. Bitte erneut versuchen.",
        });
        this.write(active);
      }
    }
    const currentlyActive = this.operations().some((o) => publicationActive(o.publication));
    if (!currentlyActive) {
      const pending = this.operations()
        .filter((o) => o.publication.status === "queued")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      const attempt = pending?.publication.attempt;
      if (
        pending &&
        attempt &&
        (attempt.kind === "waiting" || Date.now() - attempt.at > 15 * 60_000)
      ) {
        if (attempt.kind !== "waiting" && attempt.count >= 3) {
          pending.publication = transitionPublication(pending.publication, {
            type: "fail",
            error: "GitHub hat den Prüflauf noch nicht gestartet. Bitte später erneut versuchen.",
          });
          this.write(pending);
        } else {
          const token = crypto.randomUUID();
          pending.publication = transitionPublication(pending.publication, {
            type: "dispatch",
            token,
            at: Date.now(),
          });
          this.write(pending);
          try {
            await this.github.dispatch(pending.id, token);
          } catch (error) {
            pending.publication = transitionPublication(pending.publication, {
              type: "fail",
              error:
                error instanceof HttpError
                  ? error.message
                  : "GitHub ist gerade nicht erreichbar. Bitte erneut versuchen.",
            });
            this.write(pending);
          }
        }
      }
    }
    for (const [key, upload] of this.uploads()) {
      const operation =
        upload.ownership.kind === "bound" ? this.operation(upload.ownership.changeId) : undefined;
      if (uploadExpired(upload, operation)) {
        await this.env.UPLOADS.delete(upload.id);
        this.store.delete(key);
      }
    }
    for (const operation of this.operations()) {
      if (
        publicationFinished(operation.publication) &&
        Date.now() - Date.parse(operation.updatedAt) > 90 * DAY
      )
        this.store.delete(`change:${operation.id}`);
    }
    const pending = this.operations().some((o) => !publicationFinished(o.publication));
    await this.storage.setAlarm(Date.now() + (pending ? 60_000 : 3600_000));
  }
}
