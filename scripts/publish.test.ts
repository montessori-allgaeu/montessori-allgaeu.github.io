import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { checkStaticAssets } from "./check-static-assets.mjs";
import {
  assertCurrentHead,
  assertOnlyAllowedChanges,
  assertUploadHash,
  findChangeCommit,
  git,
  planOperation,
  PublishConflict,
  publishOperationSchema,
  readContentSnapshot,
  safeRemove,
  safeWrite,
  StaleRelease,
  type PublishOperation,
} from "./publish-core";

const roots: string[] = [];
async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "monte-publish-"));
  roots.push(directory);
  return directory;
}
async function repository() {
  const directory = await temporaryDirectory();
  git(directory, ["init", "--quiet"]);
  git(directory, ["config", "user.name", "Publishing test"]);
  git(directory, ["config", "user.email", "publisher@example.invalid"]);
  await writeFile(join(directory, "fixture.txt"), "initial\n");
  git(directory, ["add", "fixture.txt"]);
  git(directory, ["commit", "--quiet", "-m", "Initial fixture"]);
  return directory;
}
function runPublisher(
  directory: string,
  runnerDirectory: string,
  command: string,
  preload?: string,
) {
  return spawnSync(
    process.execPath,
    [
      "--import",
      resolve("node_modules/tsx/dist/loader.mjs"),
      ...(preload ? ["--import", `data:text/javascript,${encodeURIComponent(preload)}`] : []),
      resolve("scripts/publish.ts"),
      command,
    ],
    {
      cwd: directory,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_ACTIONS: "true",
        GITHUB_REF: "refs/heads/main",
        GITHUB_RUN_ID: "123",
        GITHUB_RUN_ATTEMPT: "1",
        MONTE_CHANGE_ID: "ab8a168c-97aa-4ee2-b3c4-233611bc940d",
        MONTE_PUBLISH_ATTEMPT: "4c6aa7f0-3f99-4698-8a1d-ef3c23aedf26",
        RUNNER_TEMP: runnerDirectory,
        ADMIN_ORIGIN: "https://admin.example.test",
        ACTIONS_ID_TOKEN_REQUEST_URL: "https://oidc.example.test/token",
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: "fixture-only",
      },
    },
  );
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("atomic content publication", () => {
  let current: Awaited<ReturnType<typeof readContentSnapshot>>;
  beforeAll(async () => {
    const directory = await repository();
    for (const path of [
      "src/content",
      "public/downloads",
      "src/assets/images/team",
      "src/assets/images/parent-council",
    ])
      await cp(resolve(path), join(directory, path), { recursive: true });
    git(directory, ["add", "src", "public"]);
    git(directory, ["commit", "--quiet", "-m", "Current content fixture"]);
    current = await readContentSnapshot(directory);
  });
  function operation(): PublishOperation {
    const event = current.snapshot.records.find((record) => record.collection === "events")!;
    return {
      id: randomUUID(),
      requestId: randomUUID(),
      mutations: [
        {
          collection: "events",
          id: event.id,
          baseVersion: event.version,
          data: { ...event.data, title: "Geänderter Termin" },
        },
      ],
      uploads: [],
    };
  }

  it("plans a valid update against the actual content schema", () => {
    const result = planOperation(operation(), current.snapshot, current.media);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].data.title).toBe("Geänderter Termin");
    expect(result.paths).toEqual([result.files[0].path]);
  });

  it("rejects a stale version before any file is written", () => {
    const change = operation();
    change.mutations[0].baseVersion = "0".repeat(40);
    expect(() => planOperation(change, current.snapshot, current.media)).toThrow(PublishConflict);
  });

  it("allows a new record only when its base version is null", () => {
    const change = operation();
    change.mutations[0].id = `termin-${randomUUID()}`;
    change.mutations[0].baseVersion = null;
    expect(planOperation(change, current.snapshot, current.media).files).toHaveLength(1);
    change.mutations[0].baseVersion = "1".repeat(40);
    expect(() => planOperation(change, current.snapshot, current.media)).toThrow(PublishConflict);
  });

  it("rejects traversal and duplicate record mutations", () => {
    const change = operation();
    change.mutations[0].id = "../../package";
    expect(() => planOperation(change, current.snapshot, current.media)).toThrow();
    const duplicate = operation();
    duplicate.mutations.push(duplicate.mutations[0]);
    expect(() => planOperation(duplicate, current.snapshot, current.media)).toThrow("mehrfach");
  });

  it("refuses uploads that are not referenced by changed records", () => {
    const change = operation();
    change.uploads.push({
      id: randomUUID(),
      path: "public/downloads/unrelated.pdf",
      size: 20,
      sha256: "a".repeat(64),
      contentType: "application/pdf",
      baseVersion: null,
    });
    expect(() => planOperation(change, current.snapshot, current.media)).toThrow("gehört nicht");
    change.uploads[0].path = ".github/workflows/publish.yml";
    expect(() => planOperation(change, current.snapshot, current.media)).toThrow("gehört nicht");
  });

  it("requires the current media blob when replacing a PDF", () => {
    const record = current.snapshot.records.find((entry) => entry.collection === "downloads")!;
    const path = `public${record.data.file}`;
    const change: PublishOperation = {
      id: randomUUID(),
      requestId: randomUUID(),
      mutations: [
        {
          collection: record.collection,
          id: record.id,
          data: record.data,
          baseVersion: record.version,
        },
      ],
      uploads: [
        {
          id: randomUUID(),
          path,
          size: 20,
          sha256: "a".repeat(64),
          contentType: "application/pdf",
          baseVersion: null,
        },
      ],
    };
    expect(() => planOperation(change, current.snapshot, current.media)).toThrow(PublishConflict);
    change.uploads[0].baseVersion = current.media.get(path)!;
    expect(planOperation(change, current.snapshot, current.media).paths).toContain(path);
  });

  it.each(["jpg", "png"])(
    "publishes a %s replacement only while both media baselines match",
    (extension) => {
      const record = current.snapshot.records.find(
        (entry) => entry.collection === "team" && String(entry.data.image).endsWith(".webp"),
      )!;
      const originalPath = `src/${String(record.data.image).slice(6)}`;
      const image = `../../assets/images/team/replacement.${extension}`;
      const path = `src/assets/images/team/replacement.${extension}`;
      const change = publishOperationSchema.parse({
        id: randomUUID(),
        requestId: randomUUID(),
        mutations: [
          {
            collection: record.collection,
            id: record.id,
            baseVersion: record.version,
            data: { ...record.data, image },
          },
        ],
        uploads: [
          {
            id: randomUUID(),
            path,
            size: 20,
            sha256: "a".repeat(64),
            contentType: extension === "jpg" ? "image/jpeg" : "image/png",
            baseVersion: null,
            replacement: { path: originalPath, baseVersion: current.media.get(originalPath) },
          },
        ],
      });
      const plan = planOperation(change, current.snapshot, current.media);
      expect(plan.files[0].data.image).toBe(image);
      expect(plan.paths).toContain(path);
      expect(plan.paths).not.toContain(originalPath);
      const changed = new Map(current.media);
      changed.set(originalPath, "e".repeat(40));
      expect(() => planOperation(change, current.snapshot, changed)).toThrow(PublishConflict);
      changed.delete(originalPath);
      expect(() => planOperation(change, current.snapshot, changed)).toThrow(PublishConflict);
      const collision = new Map(current.media).set(path, "e".repeat(40));
      expect(() => planOperation(change, current.snapshot, collision)).toThrow(PublishConflict);
    },
  );

  it("checks cross-record invariants for the complete candidate snapshot", () => {
    const program = current.snapshot.records.find(
      (record) => record.collection === "afternoonProgramSettings",
    )!;
    const change = operation();
    change.mutations.push({
      collection: program.collection,
      id: program.id,
      baseVersion: program.version,
      data: { ...program.data, activeSchoolYear: "2998/99" },
    });
    expect(() => planOperation(change, current.snapshot, current.media)).toThrow(
      "Nachmittagsangebot",
    );
  });

  it("plans record deletion and rejects stale, absent or required records", () => {
    const change = operation();
    change.mutations[0].delete = true;
    const result = planOperation(change, current.snapshot, current.media);
    expect(result.files[0]).toMatchObject({
      path: `src/content/events/${change.mutations[0].id}.yml`,
      delete: true,
    });
    change.mutations[0].baseVersion = "0".repeat(40);
    expect(() => planOperation(change, current.snapshot, current.media)).toThrow(PublishConflict);
    change.mutations[0].id = "absent";
    change.mutations[0].baseVersion = null;
    expect(() => planOperation(change, current.snapshot, current.media)).toThrow(
      /darf nicht gelöscht/,
    );
    for (const record of current.snapshot.records.filter(
      (item) => item.collection === "contactSettings" || item.id === "absichtserklaerung-schule",
    )) {
      change.mutations = [{ ...record, baseVersion: record.version, delete: true }];
      expect(() => planOperation(change, current.snapshot, current.media)).toThrow(
        /darf nicht gelöscht/,
      );
    }
    change.mutations = current.snapshot.records
      .filter((record) => record.collection === "afternoonOffers")
      .map((record) => ({ ...record, baseVersion: record.version, delete: true }));
    expect(() => planOperation(change, current.snapshot, current.media)).toThrow(
      /Nachmittagsangebot/,
    );
  });

  it("rejects unbounded or unexpected operation metadata", () => {
    expect(() => publishOperationSchema.parse({ ...operation(), shell: "anything" })).toThrow();
    const change = operation();
    change.uploads.push({
      id: randomUUID(),
      path: "public/downloads/test.pdf",
      size: 10 * 1024 * 1024 + 1,
      sha256: "a".repeat(64),
      contentType: "application/pdf",
      baseVersion: null,
    });
    expect(() => publishOperationSchema.parse(change)).toThrow();
  });
});

describe("integrity and retry safety", () => {
  it.each(["stamp", "check-head", "verify"])(
    "keeps a committed release retryable when main advances before %s",
    async (command) => {
      const directory = await repository();
      const remote = await temporaryDirectory();
      const runner = await temporaryDirectory();
      git(remote, ["init", "--bare", "--quiet"]);
      git(directory, ["remote", "add", "origin", remote]);
      const commit = git(directory, ["rev-parse", "HEAD"]);
      git(directory, ["commit", "--allow-empty", "--quiet", "-m", "Unrelated later code"]);
      git(directory, ["push", "--quiet", "origin", "HEAD:refs/heads/main"]);
      git(directory, ["checkout", "--detach", "--quiet", commit]);
      const stateFile = join(runner, "monte-publish-123-1.json");
      await writeFile(
        stateFile,
        JSON.stringify({ base: commit, paths: [], commit, releaseCommit: commit }),
      );
      const result = runPublisher(directory, runner, command);
      expect(result.status).toBe(1);
      expect(JSON.parse(await readFile(stateFile, "utf8"))).toMatchObject({
        commit,
        failed: "failed",
      });
    },
  );

  it.each([true, false])(
    "prepares an existing change commit without reapplying its stale mutations (backend receipt: %s)",
    async (hasReceipt) => {
      const directory = await repository();
      const remote = await temporaryDirectory();
      const runner = await temporaryDirectory();
      const id = "ab8a168c-97aa-4ee2-b3c4-233611bc940d";
      const path = "src/content/events/fixture.yml";
      await safeWrite(directory, path, "title: Initial value\n");
      git(directory, ["add", "--", path]);
      git(directory, ["commit", "--quiet", "-m", "Initial content"]);
      const originalBlob = git(directory, ["rev-parse", `HEAD:${path}`]);
      await safeWrite(directory, path, "title: Saved from administration\n");
      git(directory, ["add", "--", path]);
      git(directory, ["commit", "--quiet", "-m", "content: save", "-m", `Monte-Change: ${id}`]);
      const commit = git(directory, ["rev-parse", "HEAD"]);
      await safeWrite(directory, path, "title: Later deliberate edit\n");
      git(directory, ["add", "--", path]);
      git(directory, ["commit", "--quiet", "-m", "Later content edit"]);
      const latest = git(directory, ["rev-parse", "HEAD"]);
      git(remote, ["init", "--bare", "--quiet"]);
      git(directory, ["remote", "add", "origin", remote]);
      git(directory, ["push", "--quiet", "origin", "HEAD:refs/heads/main"]);
      const operation: PublishOperation = {
        id,
        requestId: randomUUID(),
        mutations: [
          {
            collection: "events",
            id: "fixture",
            baseVersion: originalBlob,
            data: { title: "Saved from administration" },
          },
        ],
        uploads: [],
        ...(hasReceipt ? { commit } : {}),
      };
      const preload = `globalThis.fetch = async (input) => {
      const url = new URL(input);
      if (url.origin === 'https://oidc.example.test') return Response.json({ value: 'fixture-oidc-token' });
      if (url.href === 'https://admin.example.test/api/publish/${id}') return Response.json(${JSON.stringify(operation)});
      throw new Error('Unexpected network request');
    };`;
      const result = runPublisher(directory, runner, "prepare", preload);
      expect(result.status, result.stderr).toBe(0);
      const state = JSON.parse(await readFile(join(runner, "monte-publish-123-1.json"), "utf8"));
      expect(state).toEqual({ base: latest, paths: [], commit });
      expect(await readFile(join(directory, path), "utf8")).toBe("title: Later deliberate edit\n");
      expect(git(directory, ["rev-parse", "HEAD"])).toBe(latest);
      expect(git(directory, ["status", "--porcelain"])).toBe("");
    },
  );

  it("rejects modified or truncated uploads", () => {
    const bytes = new TextEncoder().encode("%PDF-1.7\ncontents");
    const upload = {
      id: randomUUID(),
      path: "public/downloads/test.pdf",
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      contentType: "application/pdf" as const,
      baseVersion: null,
    };
    expect(() => assertUploadHash(upload, bytes)).not.toThrow();
    expect(() => assertUploadHash(upload, bytes.slice(0, -1))).toThrow();
    expect(() => assertUploadHash(upload, new Uint8Array(bytes.length))).toThrow();
  });

  it("finds a committed change after a callback crash and later code changes", async () => {
    const directory = await repository();
    const id = randomUUID();
    git(directory, [
      "commit",
      "--allow-empty",
      "--quiet",
      "-m",
      "content: save",
      "-m",
      `Monte-Change: ${id}`,
    ]);
    const commit = git(directory, ["rev-parse", "HEAD"]);
    git(directory, ["commit", "--allow-empty", "--quiet", "-m", "Later code change"]);
    expect(findChangeCommit(directory, id)).toBe(commit);
    expect(findChangeCommit(directory, id, commit)).toBe(commit);
    expect(findChangeCommit(directory, randomUUID())).toBeUndefined();
    expect(() => findChangeCommit(directory, randomUUID(), commit)).toThrow("Versionshistorie");
  });

  it("does not treat a subject containing the change id as a receipt", async () => {
    const directory = await repository();
    const id = randomUUID();
    git(directory, ["commit", "--allow-empty", "--quiet", "-m", `Discuss Monte-Change: ${id}`]);
    expect(findChangeCommit(directory, id)).toBeUndefined();
  });

  it("refuses deployment when remote main has advanced", async () => {
    const directory = await repository();
    const remote = await temporaryDirectory();
    git(remote, ["init", "--bare", "--quiet"]);
    git(directory, ["remote", "add", "origin", remote]);
    git(directory, ["push", "--quiet", "origin", "HEAD:refs/heads/main"]);
    expect(assertCurrentHead(directory)).toBe(git(directory, ["rev-parse", "HEAD"]));
    git(directory, ["commit", "--allow-empty", "--quiet", "-m", "Newer release"]);
    git(directory, ["push", "--quiet", "origin", "HEAD:refs/heads/main"]);
    git(directory, ["checkout", "--detach", "--quiet", "HEAD~1"]);
    expect(() => assertCurrentHead(directory)).toThrow(StaleRelease);
  });

  it("checks unstaged paths without losing the porcelain status prefix", async () => {
    const directory = await repository();
    await writeFile(join(directory, "fixture.txt"), "edited\n");
    expect(() => assertOnlyAllowedChanges(directory, new Set(["fixture.txt"]))).not.toThrow();
    await writeFile(join(directory, "unexpected.yml"), "unexpected: true\n");
    expect(() => assertOnlyAllowedChanges(directory, new Set(["fixture.txt"]))).toThrow(
      "freigegebene",
    );
  });

  it("refuses symbolic links and escaped write paths", async () => {
    const directory = await temporaryDirectory();
    const outside = await temporaryDirectory();
    await writeFile(join(outside, "protected.txt"), "unchanged");
    await symlink(outside, join(directory, "media"));
    await expect(safeWrite(directory, "media/protected.txt", "changed")).rejects.toThrow(
      "Verknüpfungen",
    );
    await expect(safeWrite(directory, "../escape.txt", "changed")).rejects.toThrow("außerhalb");
    await expect(safeRemove(directory, "media/protected.txt")).rejects.toThrow("Verknüpfungen");
    await expect(safeRemove(directory, "../escape.txt")).rejects.toThrow("außerhalb");
    expect(await readFile(join(outside, "protected.txt"), "utf8")).toBe("unchanged");
  });

  it("removes a content file without deleting its reusable media", async () => {
    const directory = await temporaryDirectory();
    await safeWrite(directory, "src/content/downloads/test.yml", "title: Test");
    await safeWrite(directory, "public/downloads/test.pdf", "%PDF-fixture");
    await safeRemove(directory, "src/content/downloads/test.yml");
    await expect(readFile(join(directory, "src/content/downloads/test.yml"))).rejects.toMatchObject(
      { code: "ENOENT" },
    );
    expect(await readFile(join(directory, "public/downloads/test.pdf"), "utf8")).toBe(
      "%PDF-fixture",
    );
  });

  it("enforces Free file count and size at the deploy boundary", async () => {
    const directory = await temporaryDirectory();
    await writeFile(join(directory, "one.html"), "one");
    await writeFile(join(directory, "two.html"), "two");
    await expect(checkStaticAssets(directory, { files: 2, bytes: 3 })).resolves.toEqual({
      files: 2,
      largestBytes: 3,
    });
    await expect(checkStaticAssets(directory, { files: 1, bytes: 3 })).rejects.toThrow(
      "Dateianzahl",
    );
    await expect(checkStaticAssets(directory, { files: 2, bytes: 2 })).rejects.toThrow(
      "Dateigrenze",
    );
  });
});
