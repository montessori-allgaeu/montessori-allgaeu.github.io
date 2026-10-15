import { z } from "zod";
import {
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

type Upload = {
  id: string;
  ownerId: string;
  path: string;
  sha256: string;
  size: number;
  contentType: string;
  baseVersion: string | null;
  createdAt: number;
  changeId?: string;
};
type Operation = Change &
  ChangeRequest & {
    ownerId: string;
    dispatchUserId: string;
    fingerprint: string;
    attempt?: string;
    runId?: string;
    runAttempt?: string;
    dispatchedAt?: number;
    dispatchCount: number;
    releaseCommit?: string;
    bankChange: boolean;
  };
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
  private operations() {
    return this.store.list<Operation>("change:").map(([, o]) => o);
  }
  private write(operation: Operation) {
    operation.updatedAt = new Date().toISOString();
    this.store.put(`change:${operation.id}`, operation);
  }
  private publicChange(operation: Operation): Change {
    const { id, status, createdAt, updatedAt, summary, error, commit, runUrl } = operation;
    const saved =
      status === "published"
        ? undefined
        : {
            mutations: operation.mutations,
            hasUploads: operation.uploadIds.length > 0,
            previews: Object.fromEntries(
              operation.uploadIds.flatMap((uploadId) => {
                const upload = this.store.get<Upload>(`upload:${uploadId}`);
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
    return { id, status, createdAt, updatedAt, summary, error, commit, runUrl, saved };
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
      this.operations().filter((o) => ["queued", "checking", "committed"].includes(o.status))
        .length < 30,
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
      const parsed = {
        ...mutation,
        data: parseContent(mutation.collection, mutation.id, mutation.data),
      };
      if (changesBankDetails(parsed, before?.data)) {
        requireAdmin(user);
        requireFresh(session.verifiedAt);
        bankChange = true;
      }
      return parsed;
    });
    const uploads = input.uploadIds.map((id) => {
      const upload = this.store.get<Upload>(`upload:${id}`);
      requireCondition(
        upload?.ownerId === user.id && !upload.changeId,
        400,
        "upload_missing",
        "Eine hochgeladene Datei ist nicht mehr verfügbar. Bitte erneut hochladen.",
      );
      requireCondition(
        (current.files.get(upload.path)?.sha ?? null) === upload.baseVersion,
        409,
        "media_conflict",
        "Diese Datei wurde inzwischen ersetzt. Bitte neu laden.",
      );
      requireCondition(
        mutations.some(
          (m) =>
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
        ...mutations.map((m) => ({ ...m, version: m.baseVersion ?? "" })),
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
      status: "queued",
      createdAt: now,
      updatedAt: now,
      summary: `${areas.join(", ")} · ${mutations.length} ${mutations.length === 1 ? "Eintrag" : "Einträge"}`,
      fingerprint,
      dispatchCount: 0,
      bankChange,
    };
    this.write(operation);
    for (const upload of uploads)
      this.store.put(`upload:${upload.id}`, { ...upload, changeId: operation.id });
    this.auth.audit(user.id, "content_saved", operation.id);
    await this.storage.setAlarm(Date.now() + 1000);
    return json(this.publicChange(operation), 202);
  }
  async retry(id: string, user: AccessUser, session: Session) {
    const operation = this.store.get<Operation>(`change:${id}`);
    requireCondition(operation, 404, "change_missing", "Änderung nicht gefunden.");
    requireCondition(
      operation.ownerId === user.id || user.role === "admin",
      403,
      "change_owner",
      "Diese Änderung gehört zu einer anderen Person.",
    );
    requireCondition(
      operation.status === "failed",
      409,
      "retry_state",
      operation.status === "conflict"
        ? "Bitte den Inhalt neu laden und den Konflikt auflösen."
        : "Die Veröffentlichung ist bereits in Arbeit oder abgeschlossen.",
    );
    if (operation.bankChange) {
      requireAdmin(user);
      requireFresh(session.verifiedAt);
    }
    // A retry delegates this already immutable change to the acting user after rechecking access.
    operation.dispatchUserId = user.id;
    operation.status = "queued";
    operation.error = undefined;
    operation.attempt = undefined;
    operation.runId = undefined;
    operation.runAttempt = undefined;
    operation.dispatchedAt = undefined;
    operation.dispatchCount = 0;
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
    const uploads = this.store.list<Upload>("upload:").map(([, u]) => u);
    requireCondition(
      uploads.reduce((size, u) => size + u.size, buffer.byteLength) <= 256 * 1024 * 1024,
      507,
      "upload_quota",
      "Der temporäre Medienspeicher ist voll. Bitte laufende Veröffentlichungen abwarten.",
    );
    const id = crypto.randomUUID();
    const replacement = form.get("replace");
    const path =
      typeof replacement === "string" && replacement
        ? mediaRepositoryPath(kind, replacement)
        : newMediaPath(kind, file.name, id, format.extension);
    validateMedia(new Uint8Array(buffer), path, format.contentType);
    const snapshot = await this.github.snapshot();
    const baseVersion = snapshot.files.get(path)?.sha ?? null;
    requireCondition(
      !replacement || baseVersion,
      409,
      "replace_missing",
      "Die zu ersetzende Datei wurde nicht gefunden.",
    );
    requireCondition(
      !replacement || form.get("baseVersion") === baseVersion,
      409,
      "media_conflict",
      "Diese Datei wurde zwischenzeitlich geändert. Bitte den Inhalt neu laden.",
    );
    const upload: Upload = {
      id,
      ownerId: user.id,
      path,
      size: buffer.byteLength,
      sha256: await hash(buffer),
      contentType: format.contentType,
      baseVersion,
      createdAt: Date.now(),
    };
    await this.env.UPLOADS.put(id, buffer);
    this.store.put(`upload:${id}`, upload);
    await this.storage.setAlarm(Date.now() + 60_000);
    const result: UploadResult = {
      id,
      value: mediaValue(path, kind),
      previewUrl: `/api/uploads/${id}`,
    };
    return json(result, 201);
  }
  async uploadPreview(id: string, user: AccessUser) {
    const upload = this.store.get<Upload>(`upload:${id}`);
    const change = upload?.changeId
      ? this.store.get<Operation>(`change:${upload.changeId}`)
      : undefined;
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
    const operation = this.store.get<Operation>(`change:${match[1]}`);
    requireCondition(
      operation &&
        operation.attempt &&
        request.headers.get("x-publish-attempt") === operation.attempt,
      403,
      "publish_attempt",
      "Dieser Veröffentlichungsversuch ist nicht mehr gültig.",
    );
    requireCondition(
      !operation.runId ||
        (operation.runId === identity.runId && operation.runAttempt === identity.runAttempt),
      409,
      "publish_claimed",
      "Die Änderung wird bereits von einem anderen Lauf verarbeitet.",
    );
    if (!operation.runId) {
      requireCondition(
        request.method === "GET" && !match[2] && operation.status === "queued",
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
      operation.runId = identity.runId;
      operation.runAttempt = identity.runAttempt;
      operation.status = "checking";
      operation.runUrl = `https://github.com/${this.env.GITHUB_REPOSITORY}/actions/runs/${identity.runId}`;
      this.write(operation);
    }
    if (request.method === "GET" && !match[2]) {
      requireCondition(
        ["checking", "committed"].includes(operation.status),
        409,
        "publish_state",
        "Diese Änderung ist bereits abgeschlossen.",
      );
      const uploads = operation.uploadIds.map((id) => {
        const upload = this.store.get<Upload>(`upload:${id}`);
        requireCondition(
          upload,
          410,
          "upload_missing",
          "Eine hochgeladene Datei ist abgelaufen. Bitte neu speichern.",
        );
        const { path, sha256, size, contentType, baseVersion } = upload;
        return { id, path, sha256, size, contentType, baseVersion };
      });
      return json({
        id: operation.id,
        requestId: operation.requestId,
        mutations: operation.mutations,
        uploads,
        commit: operation.commit,
      });
    }
    if (request.method === "GET" && match[3]) {
      requireCondition(
        operation.uploadIds.includes(match[3]),
        403,
        "upload_scope",
        "Datei gehört nicht zu dieser Änderung.",
      );
      const upload = this.store.get<Upload>(`upload:${match[3]}`);
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
    requireCondition(
      ["checking", "committed"].includes(operation.status) || operation.status === input.status,
      409,
      "publish_state",
      "Die Veröffentlichung ist bereits abgeschlossen.",
    );
    if (input.commit) {
      requireCondition(
        !operation.commit || operation.commit === input.commit,
        409,
        "commit_mismatch",
        "Die Änderung gehört zu einem anderen Commit.",
      );
      operation.commit = input.commit;
    }
    if (input.status === "committed" || input.status === "published")
      requireCondition(
        operation.commit,
        400,
        "commit_missing",
        "Die veröffentlichte Version fehlt.",
      );
    if (input.status === "published") {
      const release = input.releaseCommit ?? operation.commit;
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
      operation.releaseCommit = release;
    }
    operation.status = input.status;
    operation.error =
      input.status === "failed"
        ? "Die Prüfung oder Veröffentlichung ist fehlgeschlagen. Du kannst es erneut versuchen; Details stehen im verknüpften Prüflauf."
        : input.status === "conflict"
          ? "Der Inhalt wurde während der Prüfung geändert. Bitte neu laden und die Änderung erneut speichern."
          : undefined;
    this.write(operation);
    await this.storage.setAlarm(Date.now() + 1000);
    return json({ ok: true });
  }
  async tick() {
    this.store.clean();
    const operations = this.operations();
    const active = operations.find((o) => o.runId && ["checking", "committed"].includes(o.status));
    if (active && active.runId && Date.now() - Date.parse(active.updatedAt) > 120_000) {
      const run = await this.github.run(active.runId);
      if (run.status === "completed") {
        active.status = "failed";
        active.error =
          "Der Prüflauf ist beendet, die Veröffentlichung wurde aber nicht bestätigt. Bitte erneut versuchen.";
        this.write(active);
      }
    }
    const currentlyActive = this.operations().some(
      (o) => o.runId && ["checking", "committed"].includes(o.status),
    );
    if (!currentlyActive) {
      const pending = this.operations()
        .filter((o) => o.status === "queued")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (pending && (!pending.dispatchedAt || Date.now() - pending.dispatchedAt > 15 * 60_000)) {
        if (pending.dispatchCount >= 3) {
          pending.status = "failed";
          pending.error =
            "GitHub hat den Prüflauf noch nicht gestartet. Bitte später erneut versuchen.";
          this.write(pending);
        } else {
          pending.attempt = crypto.randomUUID();
          pending.dispatchCount++;
          pending.dispatchedAt = Date.now();
          this.write(pending);
          try {
            await this.github.dispatch(pending.id, pending.attempt);
          } catch (error) {
            pending.status = "failed";
            pending.error =
              error instanceof HttpError
                ? error.message
                : "GitHub ist gerade nicht erreichbar. Bitte erneut versuchen.";
            this.write(pending);
          }
        }
      }
    }
    for (const [key, upload] of this.store.list<Upload>("upload:")) {
      const operation = upload.changeId
        ? this.store.get<Operation>(`change:${upload.changeId}`)
        : undefined;
      const finished = operation && ["published", "failed", "conflict"].includes(operation.status);
      const stale =
        (!upload.changeId && Date.now() - upload.createdAt > DAY) ||
        (finished &&
          Date.now() - Date.parse(operation.updatedAt) >
            (operation.status === "published" ? DAY : 7 * DAY));
      if (stale) {
        await this.env.UPLOADS.delete(upload.id);
        this.store.delete(key);
      }
    }
    for (const operation of this.operations()) {
      if (
        ["published", "failed", "conflict"].includes(operation.status) &&
        Date.now() - Date.parse(operation.updatedAt) > 90 * DAY
      )
        this.store.delete(`change:${operation.id}`);
    }
    const pending = this.operations().some((o) =>
      ["queued", "checking", "committed"].includes(o.status),
    );
    await this.storage.setAlarm(Date.now() + (pending ? 60_000 : 3600_000));
  }
}
