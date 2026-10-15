import { env } from "cloudflare:workers";
import { reset, runInDurableObject } from "cloudflare:test";
import { exportJWK, exportPKCS8, generateKeyPair, SignJWT } from "jose";
import { parse } from "yaml";
import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import {
  contentDefinitions,
  getContentPath,
  mediaRepositoryPath,
  parseContent,
} from "../src/admin/content-model";
import type {
  AccessUser,
  Change,
  ChangeRequest,
  ContentRecord,
  EditableContentSnapshot,
  UploadResult,
} from "../src/admin/types";
import { Auth, type Session } from "./auth";
import type { Env } from "./env";
import { GitHub } from "./github";
import { Publishing } from "./publishing";
import { Store } from "./store";

const sources = import.meta.glob<string>("../src/content/**/*.yml", {
  eager: true,
  query: "?raw",
  import: "default",
});
const contentFiles = Object.entries(sources).map(([path, text], index) => ({
  path: path.slice(3),
  text,
  sha: (index + 1).toString(16).padStart(40, "0"),
}));
const records: ContentRecord[] = contentDefinitions.flatMap((definition) =>
  contentFiles
    .filter((file) =>
      definition.singleton
        ? file.path === getContentPath(definition.collection, definition.singleton)
        : file.path.startsWith(`${definition.directory}/`),
    )
    .map((file) => {
      const id = file.path.slice(definition.directory.length + 1, -4);
      return {
        collection: definition.collection,
        id,
        version: file.sha,
        data: parseContent(definition.collection, id, parse(file.text)),
      };
    }),
);
const mediaPaths = [
  ...new Set(
    records.flatMap((record) => {
      const value = record.collection === "downloads" ? record.data.file : record.data.image;
      return typeof value === "string" ? [mediaRepositoryPath(record.collection, value)] : [];
    }),
  ),
];
const origin = "https://verwaltung.example.test";
const repository = "fixture/monte";
const head = "f".repeat(40);
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let privateKey: string;
let publicJwk: Awaited<ReturnType<typeof exportJWK>>;
let publishedCommit: string;
let mediaVersionOverride: string | undefined;
let dispatches: { ref: string; inputs: { change_id: string; attempt: string } }[];

beforeAll(async () => {
  keys = await generateKeyPair("RS256", { extractable: true });
  privateKey = await exportPKCS8(keys.privateKey);
  publicJwk = {
    ...(await exportJWK(keys.publicKey)),
    kid: "publishing-key",
    alg: "RS256",
    use: "sig",
  };
});
beforeEach(() => {
  dispatches = [];
  publishedCommit = "a".repeat(40);
  mediaVersionOverride = undefined;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.href === "https://token.actions.githubusercontent.com/.well-known/jwks")
      return Response.json({ keys: [publicJwk] });
    if (url.origin === "https://public.example.test" && url.pathname === "/version.json")
      return Response.json({ commit: publishedCommit });
    if (url.origin !== "https://api.github.com")
      throw new Error(`Unexpected network destination: ${url.origin}`);
    if (url.pathname === "/app/installations/2/access_tokens")
      return Response.json({
        token: "fixture-installation-token",
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      });
    if (url.pathname.endsWith("/git/ref/heads/main"))
      return Response.json({ object: { sha: head } });
    if (url.pathname.endsWith(`/git/trees/${head}`))
      return Response.json({
        truncated: false,
        tree: [
          ...contentFiles.map(({ path, sha }) => ({ path, sha, mode: "100644", type: "blob" })),
          ...mediaPaths.map((path, index) => ({
            path,
            sha: mediaVersionOverride ?? (index + 1000).toString(16).padStart(40, "0"),
            mode: "100644",
            type: "blob",
          })),
        ],
      });
    if (url.pathname === "/graphql") {
      const query = JSON.parse(String(init?.body)).query as string;
      const blobs = Object.fromEntries(
        [...query.matchAll(/(b\d+): object\(oid: "([a-f0-9]+)"\)/g)].map(([, alias, sha]) => {
          const file = contentFiles.find((entry) => entry.sha === sha)!;
          return [
            alias,
            { oid: sha, text: file.text, byteSize: new TextEncoder().encode(file.text).length },
          ];
        }),
      );
      return Response.json({ data: { repository: blobs } });
    }
    if (url.pathname.endsWith("/actions/workflows/publish.yml/dispatches")) {
      dispatches.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected GitHub path: ${url.pathname}`);
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await reset();
});

function user(role: AccessUser["role"] = "content-manager"): AccessUser {
  return {
    id: crypto.randomUUID(),
    name: "Publishing fixture",
    role,
    active: true,
    createdAt: new Date().toISOString(),
    passkeyCount: 1,
  };
}
function session(account: AccessUser): Session {
  return {
    id: crypto.randomUUID(),
    userId: account.id,
    csrfToken: crypto.randomUUID(),
    createdAt: Date.now(),
    lastSeen: Date.now(),
    verifiedAt: Date.now(),
  };
}
function change(record = records.find((record) => record.collection === "events")!): ChangeRequest {
  return {
    requestId: crypto.randomUUID(),
    mutations: [
      {
        collection: record.collection,
        id: record.id,
        baseVersion: record.version,
        data: structuredClone(record.data),
      },
    ],
    uploadIds: [],
  };
}
type Context = { publishing: Publishing; store: Store; auth: Auth; storage: DurableObjectStorage };
async function withPublishing(callback: (context: Context) => Promise<void>) {
  return runInDurableObject(
    env.ADMIN.getByName(crypto.randomUUID()),
    async (_instance, context) => {
      const settings: Env = {
        ...env,
        ADMIN_ORIGIN: origin,
        PUBLIC_SITE_URL: "https://public.example.test",
        GITHUB_REPOSITORY: repository,
        GITHUB_REPOSITORY_ID: "123",
        GITHUB_APP_ID: "1",
        GITHUB_INSTALLATION_ID: "2",
        GITHUB_APP_PRIVATE_KEY: privateKey,
      };
      const store = new Store(context.storage.sql);
      const auth = new Auth(store, settings);
      const publishing = new Publishing(
        store,
        settings,
        new GitHub(settings),
        auth,
        context.storage,
      );
      try {
        await callback({ publishing, store, auth, storage: context.storage });
      } finally {
        await context.storage.deleteAlarm();
      }
    },
  );
}
function pdfRequest(replace?: string, baseVersion?: string) {
  const data = new FormData();
  data.set("kind", "downloads");
  data.set(
    "file",
    new File(["%PDF-1.7\nfixture\n%%EOF"], "fixture.pdf", { type: "application/pdf" }),
  );
  if (replace) data.set("replace", replace);
  if (baseVersion) data.set("baseVersion", baseVersion);
  return new Request(`${origin}/api/uploads`, { method: "POST", body: data });
}

test("accepts an atomic edit and makes retries idempotent without queuing duplicate work", async () => {
  await withPublishing(async ({ publishing, store, storage }) => {
    const account = user();
    const input = change();
    input.mutations[0].data.title = "Neuer Testtermin";
    const firstResponse = await publishing.submit(input, account, session(account));
    expect(firstResponse.status).toBe(202);
    const first = await firstResponse.json<Change>();
    expect(first.status).toBe("queued");
    expect(await storage.getAlarm()).not.toBeNull();
    const repeated = await (
      await publishing.submit(input, account, session(account))
    ).json<Change>();
    expect(repeated.id).toBe(first.id);
    expect(store.list("change:")).toHaveLength(1);
    expect(store.list("audit:")).toHaveLength(1);
    input.mutations[0].data.title = "Changed request body";
    await expect(publishing.submit(input, account, session(account))).rejects.toMatchObject({
      status: 409,
      code: "request_reused",
    });
    expect(store.list("change:")).toHaveLength(1);
  });
});

test("rejects a stale record and cross-record invalid edits without persisting a partial operation", async () => {
  await withPublishing(async ({ publishing, store }) => {
    const account = user();
    const stale = change();
    stale.mutations[0].baseVersion = "0".repeat(40);
    await expect(publishing.submit(stale, account, session(account))).rejects.toMatchObject({
      status: 409,
      code: "content_conflict",
    });
    const invalid = change(
      records.find((record) => record.collection === "afternoonProgramSettings")!,
    );
    invalid.mutations[0].data.activeSchoolYear = "2998/99";
    await expect(publishing.submit(invalid, account, session(account))).rejects.toMatchObject({
      status: 400,
      code: "content_invalid",
    });
    expect(store.list("change:")).toHaveLength(0);
    expect(store.list("audit:")).toHaveLength(0);
  });
});

test("content managers may edit donation copy but cannot change bank data; admins need fresh verification", async () => {
  await withPublishing(async ({ publishing }) => {
    const manager = user();
    for (const field of ["recipient", "bank", "iban", "bic"]) {
      const protectedChange = change(records.find((record) => record.collection === "donations")!);
      (
        protectedChange.mutations[0].data.directDonation as { account: Record<string, string> }
      ).account[field] = "Changed bank value";
      await expect(
        publishing.submit(protectedChange, manager, session(manager)),
      ).rejects.toMatchObject({ status: 403, code: "admin_required" });
    }
    const input = change(records.find((record) => record.collection === "donations")!);
    const donation = input.mutations[0].data.directDonation as { account: Record<string, string> };
    donation.account.recipient = "Changed recipient";
    const admin = user("admin");
    await expect(
      publishing.submit(input, admin, { ...session(admin), verifiedAt: Date.now() - 6 * 60_000 }),
    ).rejects.toMatchObject({ status: 428, code: "reauth_required" });
    expect((await publishing.submit(input, admin, session(admin))).status).toBe(202);
    const editorial = change(records.find((record) => record.collection === "donations")!);
    (
      editorial.mutations[0].data.directDonation as { account: Record<string, string> }
    ).account.purpose = "Für die Monte";
    expect((await publishing.submit(editorial, manager, session(manager))).status).toBe(202);
  });
});

test("uploads are private, belong to their uploader and can bind to only one change", async () => {
  await withPublishing(async ({ publishing, store }) => {
    const owner = user();
    const other = user();
    const upload = await (await publishing.upload(pdfRequest(), owner)).json<UploadResult>();
    expect(await env.UPLOADS.get(upload.id)).toContain("%PDF-1.7");
    await expect(publishing.uploadPreview(upload.id, other)).rejects.toMatchObject({
      status: 404,
      code: "upload_missing",
    });
    expect((await publishing.uploadPreview(upload.id, user("admin"))).status).toBe(200);
    const input = change(
      records.find((record) => record.collection === "downloads" && record.data.visible)!,
    );
    input.mutations[0].data.file = upload.value;
    input.uploadIds = [upload.id];
    await expect(publishing.submit(input, other, session(other))).rejects.toMatchObject({
      status: 400,
      code: "upload_missing",
    });
    const result = await (await publishing.submit(input, owner, session(owner))).json<Change>();
    expect(store.get<{ changeId: string }>(`upload:${upload.id}`)?.changeId).toBe(result.id);
    await expect(
      publishing.submit({ ...input, requestId: crypto.randomUUID() }, owner, session(owner)),
    ).rejects.toMatchObject({ status: 400, code: "upload_missing" });
    expect(store.list("change:")).toHaveLength(1);
  });
});

test("refuses a PDF replacement when the original file changed after upload", async () => {
  await withPublishing(async ({ publishing, store }) => {
    const owner = user();
    const record = records.find((entry) => entry.collection === "downloads" && entry.data.visible)!;
    const original = record.data.file as string;
    const baseline = await (await publishing.content()).json<EditableContentSnapshot>();
    const upload = await (
      await publishing.upload(pdfRequest(original, baseline.mediaVersions[original]), owner)
    ).json<UploadResult>();
    expect(upload.value).toBe(original);
    mediaVersionOverride = "e".repeat(40);
    const input = change(record);
    input.uploadIds = [upload.id];
    await expect(publishing.submit(input, owner, session(owner))).rejects.toMatchObject({
      status: 409,
      code: "media_conflict",
    });
    expect(store.list("change:")).toHaveLength(0);
    expect(store.get<{ changeId?: string }>(`upload:${upload.id}`)?.changeId).toBeUndefined();
  });
});

test("rejects stale or missing media baselines before staging a replacement", async () => {
  await withPublishing(async ({ publishing, store }) => {
    const owner = user();
    const baseline = await (await publishing.content()).json<EditableContentSnapshot>();
    const record = baseline.records.find(
      (entry) => entry.collection === "downloads" && entry.data.visible,
    )!;
    const original = record.data.file as string;
    expect(baseline.mediaVersions[original]).toMatch(/^[a-f0-9]{40}$/);
    await expect(publishing.upload(pdfRequest(original), owner)).rejects.toMatchObject({
      status: 409,
      code: "media_conflict",
    });
    mediaVersionOverride = "e".repeat(40);
    await expect(
      publishing.upload(pdfRequest(original, baseline.mediaVersions[original]), owner),
    ).rejects.toMatchObject({ status: 409, code: "media_conflict" });
    expect(store.list("upload:")).toHaveLength(0);
    const latest = await (await publishing.content()).json<EditableContentSnapshot>();
    expect(
      (await publishing.upload(pdfRequest(original, latest.mediaVersions[original]), owner)).status,
    ).toBe(201);
  });
});

test("detects corrupted stored upload bytes", async () => {
  await withPublishing(async ({ publishing }) => {
    const owner = user();
    const upload = await (await publishing.upload(pdfRequest(), owner)).json<UploadResult>();
    await env.UPLOADS.put(upload.id, "changed bytes");
    await expect(publishing.uploadPreview(upload.id, owner)).rejects.toMatchObject({
      status: 503,
      code: "upload_integrity",
    });
  });
});

async function runnerRequest(
  changeId: string,
  attempt: string,
  runId = "456",
  runAttempt = "1",
  suffix = "",
  method = "GET",
) {
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    repository_id: "123",
    repository,
    ref: "refs/heads/main",
    workflow_ref: `${repository}/.github/workflows/publish.yml@refs/heads/main`,
    event_name: "workflow_dispatch",
    sub: `repo:${repository}:ref:refs/heads/main`,
    run_id: runId,
    run_attempt: runAttempt,
    iss: "https://token.actions.githubusercontent.com",
    aud: origin,
    iat: now,
    exp: now + 300,
  })
    .setProtectedHeader({ alg: "RS256", kid: "publishing-key" })
    .sign(keys.privateKey);
  return new Request(`${origin}/api/publish/${changeId}${suffix}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "x-publish-attempt": attempt },
  });
}
async function run(publishing: Publishing, request: Request, body?: unknown) {
  return publishing.runner(request, new URL(request.url), body);
}
async function queued(publishing: Publishing, store: Store, account = user()) {
  store.put(`user:${account.id}`, account);
  const input = change();
  const result = await (await publishing.submit(input, account, session(account))).json<Change>();
  await publishing.tick();
  const dispatch = dispatches.at(-1)!;
  expect(dispatch.inputs.change_id).toBe(result.id);
  return { account, input, id: result.id, attempt: dispatch.inputs.attempt };
}

test("binds one dispatch nonce to one signed run and attempt before allowing callbacks", async () => {
  await withPublishing(async ({ publishing, store }) => {
    const job = await queued(publishing, store);
    await expect(
      run(publishing, await runnerRequest(job.id, crypto.randomUUID())),
    ).rejects.toMatchObject({ status: 403, code: "publish_attempt" });
    await expect(
      run(publishing, await runnerRequest(job.id, job.attempt, "456", "1", "/status", "POST"), {
        status: "committed",
        commit: "a".repeat(40),
      }),
    ).rejects.toMatchObject({ status: 409, code: "publish_state" });
    const claimed = await (
      await run(publishing, await runnerRequest(job.id, job.attempt))
    ).json<{ id: string; mutations: unknown[] }>();
    expect(claimed.id).toBe(job.id);
    expect(claimed.mutations).toHaveLength(1);
    await expect(
      run(publishing, await runnerRequest(job.id, job.attempt, "457")),
    ).rejects.toMatchObject({ status: 409, code: "publish_claimed" });
    await expect(
      run(publishing, await runnerRequest(job.id, job.attempt, "456", "2")),
    ).rejects.toMatchObject({ status: 409, code: "publish_claimed" });
    expect((await run(publishing, await runnerRequest(job.id, job.attempt))).status).toBe(200);
  });
});

test("verifies live release before publication and keeps commit identity immutable", async () => {
  await withPublishing(async ({ publishing, store }) => {
    const job = await queued(publishing, store);
    await run(publishing, await runnerRequest(job.id, job.attempt));
    const callback = await runnerRequest(job.id, job.attempt, "456", "1", "/status", "POST");
    await run(publishing, callback, { status: "committed", commit: "a".repeat(40) });
    await expect(
      run(publishing, callback, { status: "committed", commit: "b".repeat(40) }),
    ).rejects.toMatchObject({ status: 409, code: "commit_mismatch" });
    await expect(
      run(publishing, callback, {
        status: "published",
        commit: "a".repeat(40),
        releaseCommit: "b".repeat(40),
      }),
    ).rejects.toMatchObject({ status: 503, code: "not_live" });
    expect(store.get<Change>(`change:${job.id}`)?.status).toBe("committed");
    publishedCommit = "b".repeat(40);
    expect(
      (
        await run(publishing, callback, {
          status: "published",
          commit: "a".repeat(40),
          releaseCommit: publishedCommit,
        })
      ).status,
    ).toBe(200);
    expect(store.get<Change>(`change:${job.id}`)?.status).toBe("published");
    await expect(run(publishing, callback, { status: "failed" })).rejects.toMatchObject({
      status: 409,
      code: "publish_state",
    });
  });
});

test("checks owner permission again when a queued change is claimed", async () => {
  await withPublishing(async ({ publishing, store }) => {
    const job = await queued(publishing, store);
    store.put(`user:${job.account.id}`, { ...job.account, active: false });
    await expect(run(publishing, await runnerRequest(job.id, job.attempt))).rejects.toMatchObject({
      status: 403,
      code: "publish_owner",
    });
    expect(store.get<Change>(`change:${job.id}`)?.status).toBe("queued");
  });
});

test("an admin retry preserves the original request identity and invalidates the earlier dispatch", async () => {
  await withPublishing(async ({ publishing, store }) => {
    const job = await queued(publishing, store);
    await run(publishing, await runnerRequest(job.id, job.attempt));
    await run(publishing, await runnerRequest(job.id, job.attempt, "456", "1", "/status", "POST"), {
      status: "failed",
      commit: "a".repeat(40),
    });
    const admin = user("admin");
    store.put(`user:${admin.id}`, admin);
    expect((await publishing.retry(job.id, admin, session(admin))).status).toBe(202);
    const repeated = await (
      await publishing.submit(job.input, job.account, session(job.account))
    ).json<Change>();
    expect(repeated.id).toBe(job.id);
    expect(store.list("change:")).toHaveLength(1);
    await publishing.tick();
    const nextAttempt = dispatches.at(-1)!.inputs.attempt;
    expect(nextAttempt).not.toBe(job.attempt);
    await expect(run(publishing, await runnerRequest(job.id, job.attempt))).rejects.toMatchObject({
      status: 403,
      code: "publish_attempt",
    });
    const retried = await (
      await run(publishing, await runnerRequest(job.id, nextAttempt, "457"))
    ).json<{ commit: string }>();
    expect(retried.commit).toBe("a".repeat(40));
  });
});
