import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { validateMedia } from "../worker/media";
import {
  assertCurrentHead,
  assertOnlyAllowedChanges,
  assertUploadHash,
  changeIdSchema,
  commitSchema,
  findChangeCommit,
  git,
  maximumUploadBytes,
  planOperation,
  PublishConflict,
  publishOperationSchema,
  readContentSnapshot,
  safeWrite,
  StaleRelease,
  writeContentFile,
  type PublishUpload,
} from "./publish-core";

const root = process.cwd();
const changeId = process.env.MONTE_CHANGE_ID || undefined;
const attempt = process.env.MONTE_PUBLISH_ATTEMPT || undefined;
const stateSchema = z.strictObject({
  base: commitSchema,
  paths: z.array(z.string()),
  commit: commitSchema.optional(),
  releaseCommit: commitSchema.optional(),
  failed: z.enum(["failed", "conflict"]).optional(),
});
type State = z.infer<typeof stateSchema>;

function origin(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} fehlt.`);
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  )
    throw new Error(`${name} muss eine HTTPS-Origin sein.`);
  return parsed.origin;
}

function stateFile(): string {
  const run = process.env.GITHUB_RUN_ID;
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT;
  if (
    !process.env.RUNNER_TEMP ||
    !run ||
    !/^\d+$/.test(run) ||
    !runAttempt ||
    !/^\d+$/.test(runAttempt)
  )
    throw new Error("Die Veröffentlichung muss in GitHub Actions laufen.");
  return join(process.env.RUNNER_TEMP, `monte-publish-${run}-${runAttempt}.json`);
}

async function readState(): Promise<State> {
  return stateSchema.parse(JSON.parse(await readFile(stateFile(), "utf8")));
}

async function saveState(state: State): Promise<void> {
  await writeFile(stateFile(), `${JSON.stringify(stateSchema.parse(state))}\n`, { mode: 0o600 });
}

async function oidcToken(): Promise<string> {
  const endpoint = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!endpoint || !requestToken) throw new Error("GitHub OIDC ist nicht verfügbar.");
  const url = new URL(endpoint);
  if (url.protocol !== "https:") throw new Error("Ungültiger OIDC-Endpunkt.");
  url.searchParams.set("audience", origin("ADMIN_ORIGIN"));
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${requestToken}` },
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error("GitHub konnte die Laufidentität nicht bestätigen.");
  const body = z.object({ value: z.string().min(1) }).parse(await response.json());
  return body.value;
}

async function api(path: string, body?: unknown): Promise<Response> {
  if (!changeId || !attempt) throw new Error("Änderung und Dispatch-Kennung fehlen.");
  const response = await fetch(`${origin("ADMIN_ORIGIN")}/api/publish/${changeId}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${await oidcToken()}`,
      "x-publish-attempt": attempt,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  return response;
}

async function status(body: {
  status: "committed" | "published" | "failed" | "conflict";
  commit?: string;
  releaseCommit?: string;
  error?: string;
}): Promise<void> {
  if (!changeId) return;
  for (let index = 0; index < 3; index += 1) {
    try {
      const response = await api("/status", body);
      if (response.ok) return;
      if (response.status < 500 && response.status !== 429)
        throw new Error("Statusmeldung wurde abgelehnt.");
    } catch (error) {
      if (index === 2) throw error;
    }
    await delay(2_000 * (index + 1));
  }
  throw new Error("Der Veröffentlichungsstatus konnte nicht gespeichert werden.");
}

async function download(upload: PublishUpload): Promise<Uint8Array> {
  // KV propagation can take about a minute; never retry indefinitely or accept partial bytes.
  for (let index = 0; index < 9; index += 1) {
    const response = await api(`/uploads/${upload.id}`);
    if (response.ok) {
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Die Datei konnte nicht gelesen werden.");
      const parts: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maximumUploadBytes || size > upload.size) {
          await reader.cancel();
          throw new Error("Die Datei überschreitet die erlaubte Größe.");
        }
        parts.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const part of parts) {
        bytes.set(part, offset);
        offset += part.byteLength;
      }
      assertUploadHash(upload, bytes);
      validateMedia(bytes, upload.path, upload.contentType);
      return bytes;
    }
    if (![404, 409, 429, 503].includes(response.status) || index === 8)
      throw new Error(
        "Die hochgeladene Datei ist nicht verfügbar. Bitte die Veröffentlichung erneut versuchen.",
      );
    await delay(10_000);
  }
  throw new Error("Die Datei ist noch nicht verfügbar.");
}

async function prepare(): Promise<void> {
  assertOnlyAllowedChanges(root, new Set());
  const state: State = { base: assertCurrentHead(root), paths: [] };
  await saveState(state);
  if (!changeId) return;
  const response = await api("");
  if (!response.ok)
    throw new Error("Die Änderung konnte nicht für diesen Lauf freigegeben werden.");
  const operation = publishOperationSchema.parse(await response.json());
  if (operation.id !== changeId)
    throw new Error("Die freigegebene Änderung hat eine andere Kennung.");
  state.commit = findChangeCommit(root, changeId, operation.commit);
  if (state.commit) {
    await saveState(state);
    return;
  }
  const { snapshot, media } = await readContentSnapshot(root);
  const plan = planOperation(operation, snapshot, media);
  const uploads = [];
  for (const upload of operation.uploads)
    uploads.push({ path: upload.path, bytes: await download(upload) });
  state.paths = plan.paths;
  await saveState(state);
  for (const file of plan.files) await writeContentFile(root, file.path, file.data);
  for (const upload of uploads) await safeWrite(root, upload.path, upload.bytes);
  assertOnlyAllowedChanges(root, new Set(state.paths));
}

async function commit(): Promise<void> {
  const state = await readState();
  if (git(root, ["rev-parse", "HEAD"]) !== state.base)
    throw new Error("Der geprüfte Repository-Stand wurde unerwartet geändert.");
  assertOnlyAllowedChanges(root, new Set(state.paths));
  assertCurrentHead(root);
  if (changeId && !state.commit) {
    git(root, ["add", "--", ...state.paths]);
    git(root, [
      "-c",
      "user.name=Monte Verwaltung",
      "-c",
      "user.email=41898282+github-actions[bot]@users.noreply.github.com",
      "commit",
      "--allow-empty",
      "-m",
      "content: update Monte website",
      "-m",
      `Monte-Change: ${changeId}`,
    ]);
    // A non-fast-forward push fails; rebasing a tested artifact would invalidate its checks.
    git(root, ["push", "origin", "HEAD:refs/heads/main"]);
    state.commit = git(root, ["rev-parse", "HEAD"]);
    await saveState(state);
  }
  state.releaseCommit = assertCurrentHead(root);
  await saveState(state);
  if (state.commit) await status({ status: "committed", commit: state.commit });
}

async function stamp(): Promise<void> {
  const state = await readState();
  const release = commitSchema.parse(state.releaseCommit);
  if (assertCurrentHead(root) !== release) throw new StaleRelease();
  for (const directory of ["dist", "dist-admin"])
    await writeFile(
      join(root, directory, "version.json"),
      `${JSON.stringify({ commit: release })}\n`,
    );
}

async function verify(): Promise<void> {
  const state = await readState();
  const release = commitSchema.parse(state.releaseCommit);
  assertCurrentHead(root);
  for (const name of ["PUBLIC_SITE_URL", "ADMIN_ORIGIN"]) {
    let verified = false;
    for (let index = 0; index < 12; index += 1) {
      try {
        const response = await fetch(`${origin(name)}/version.json?release=${release}`, {
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
        });
        if (response.ok && ((await response.json()) as { commit?: string }).commit === release) {
          verified = true;
          break;
        }
      } catch {
        /* Deployment propagation is bounded and retryable. */
      }
      await delay(5_000);
    }
    if (!verified)
      throw new Error("Die veröffentlichte Version konnte noch nicht bestätigt werden.");
  }
  assertCurrentHead(root);
  if (state.commit)
    await status({ status: "published", commit: state.commit, releaseCommit: release });
  process.stdout.write(`Veröffentlichte Version bestätigt: ${release}\n`);
}

async function failure(): Promise<void> {
  if (!changeId) return;
  const state = await readState().catch(() => undefined);
  await status({
    status: state?.failed ?? "failed",
    commit: state?.commit,
    error:
      state?.failed === "conflict"
        ? "Inzwischen wurde ein betroffener Inhalt geändert. Bitte den aktuellen Stand laden und erneut speichern."
        : "Die Prüfung oder Veröffentlichung ist fehlgeschlagen. Gespeicherte Inhalte bleiben erhalten; bitte erneut versuchen.",
  });
}

async function main(): Promise<void> {
  if (process.env.GITHUB_ACTIONS !== "true" || process.env.GITHUB_REF !== "refs/heads/main")
    throw new Error("Veröffentlichungen sind nur aus main in GitHub Actions erlaubt.");
  if (Boolean(changeId) !== Boolean(attempt))
    throw new Error("Änderung und Dispatch-Kennung müssen gemeinsam angegeben werden.");
  if (changeId) {
    changeIdSchema.parse(changeId);
    changeIdSchema.parse(attempt);
  }
  const command = process.argv[2];
  if (command === "prepare") await prepare();
  else if (command === "commit") await commit();
  else if (command === "stamp") await stamp();
  else if (command === "check-head") assertCurrentHead(root);
  else if (command === "verify") await verify();
  else if (command === "failure") await failure();
  else throw new Error("Unbekannter Veröffentlichungsschritt.");
}

try {
  await main();
} catch (error) {
  const state = await readState().catch(() => undefined);
  if (state)
    await saveState({
      ...state,
      failed: error instanceof PublishConflict && !state.commit ? "conflict" : "failed",
    });
  // Never echo request bodies, provider responses, tokens or uploaded file contents.
  console.error(
    error instanceof PublishConflict || error instanceof StaleRelease
      ? error.message
      : "Veröffentlichung fehlgeschlagen. Die Prüfung und der fehlgeschlagene Workflow-Schritt enthalten weitere Hinweise.",
  );
  process.exitCode = 1;
}
