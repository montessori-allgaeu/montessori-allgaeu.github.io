import { env } from "cloudflare:workers";
import { exportJWK, exportPKCS8, generateKeyPair, jwtVerify, SignJWT } from "jose";
import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { contentDefinitions, getContentPath } from "../src/admin/content-model";
import { contentCollections } from "../src/admin/types";
import type { Env } from "./env";
import { GitHub, verifyRunner } from "./github";

const sources = import.meta.glob<string>("../src/content/**/*.yml", {
  eager: true,
  query: "?raw",
  import: "default",
});
const files = Object.entries(sources).map(([path, text], index) => ({
  path: path.slice(3),
  text,
  sha: (index + 1).toString(16).padStart(40, "0"),
}));
const origin = "https://verwaltung.example.test";
const repository = "fixture/monte";
const head = "f".repeat(40);
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let privateKey: string;
let publicJwk: Awaited<ReturnType<typeof exportJWK>>;
let requests: { path: string; init?: RequestInit }[];
let truncated = false;
let missingGraphqlBlob = false;

beforeAll(async () => {
  keys = await generateKeyPair("RS256", { extractable: true });
  privateKey = await exportPKCS8(keys.privateKey);
  publicJwk = {
    ...(await exportJWK(keys.publicKey)),
    kid: "fixture-key",
    alg: "RS256",
    use: "sig",
  };
});
beforeEach(() => {
  requests = [];
  truncated = false;
  missingGraphqlBlob = false;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    requests.push({ path: url.pathname, init });
    if (url.href === "https://token.actions.githubusercontent.com/.well-known/jwks")
      return Response.json({ keys: [publicJwk] });
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
        truncated,
        tree: files.map(({ path, sha, text }) => ({
          path,
          sha,
          size: new TextEncoder().encode(text).length,
          mode: "100644",
          type: "blob",
        })),
      });
    if (url.pathname === "/graphql") {
      const query = JSON.parse(String(init?.body)).query as string;
      const result = Object.fromEntries(
        [...query.matchAll(/(b\d+): object\(oid: "([a-f0-9]+)"\)/g)].map(([, alias, sha]) => {
          const file = files.find((entry) => entry.sha === sha)!;
          return [
            alias,
            missingGraphqlBlob
              ? null
              : { oid: sha, text: file.text, byteSize: new TextEncoder().encode(file.text).length },
          ];
        }),
      );
      return Response.json({ data: { repository: result } });
    }
    if (url.pathname.endsWith("/actions/workflows/publish.yml/dispatches"))
      return new Response(null, { status: 204 });
    throw new Error(`Unexpected GitHub path: ${url.pathname}`);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

function settings(): Env {
  return {
    ...env,
    ADMIN_ORIGIN: origin,
    GITHUB_REPOSITORY: repository,
    GITHUB_REPOSITORY_ID: "123",
    GITHUB_OIDC_SUB: "repo:fixture@42/monte@123:ref:refs/heads/main",
    GITHUB_APP_ID: "1",
    GITHUB_INSTALLATION_ID: "2",
    GITHUB_APP_PRIVATE_KEY: privateKey,
  };
}

test("reads all 16 collections once, including independent singletons sharing settings", async () => {
  const github = new GitHub(settings());
  const snapshot = await github.snapshot();
  expect(snapshot.revision).toBe(head);
  expect(new Set(snapshot.records.map((record) => record.collection))).toEqual(
    new Set(contentCollections),
  );
  expect(snapshot.records).toHaveLength(files.length);
  expect(
    new Set(snapshot.records.map((record) => getContentPath(record.collection, record.id))).size,
  ).toBe(files.length);
  for (const definition of contentDefinitions.filter((entry) => entry.singleton)) {
    const records = snapshot.records.filter(
      (record) => record.collection === definition.collection,
    );
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe(definition.singleton);
  }
  expect(requests.filter((request) => request.path === "/graphql")).toHaveLength(
    Math.ceil(files.length / 30),
  );
  const again = await github.snapshot();
  expect(again.records).toEqual(snapshot.records);
  expect(requests.filter((request) => request.path === "/graphql")).toHaveLength(
    Math.ceil(files.length / 30),
  );
  expect(requests.filter((request) => request.path.includes("access_tokens"))).toHaveLength(1);
});

test("scopes the installation token and dispatch to this repository and main", async () => {
  const github = new GitHub(settings());
  const id = crypto.randomUUID();
  const attempt = crypto.randomUUID();
  await github.dispatch(id, attempt);
  const tokenRequest = requests.find((request) => request.path.includes("access_tokens"))!;
  expect(JSON.parse(String(tokenRequest.init?.body))).toEqual({
    repository_ids: [123],
    permissions: { contents: "read", actions: "write" },
  });
  const authorization = new Headers(tokenRequest.init?.headers).get("Authorization")!;
  expect((await jwtVerify(authorization.slice(7), keys.publicKey)).payload.iss).toBe("1");
  const dispatch = requests.find((request) => request.path.endsWith("dispatches"))!;
  expect(dispatch.path).toBe(`/repos/${repository}/actions/workflows/publish.yml/dispatches`);
  expect(JSON.parse(String(dispatch.init?.body))).toEqual({
    ref: "main",
    inputs: { change_id: id, attempt },
  });
});

test("refuses incomplete trees and missing content blobs instead of returning partial content", async () => {
  truncated = true;
  await expect(new GitHub(settings()).snapshot()).rejects.toMatchObject({
    status: 503,
    code: "tree_size",
  });
  truncated = false;
  missingGraphqlBlob = true;
  await expect(new GitHub(settings()).snapshot()).rejects.toMatchObject({
    status: 503,
    code: "content_read",
  });
});

const validClaims = {
  repository_id: "123",
  repository,
  ref: "refs/heads/main",
  workflow_ref: `${repository}/.github/workflows/publish.yml@refs/heads/main`,
  event_name: "workflow_dispatch",
  sub: "repo:fixture@42/monte@123:ref:refs/heads/main",
  run_id: "456",
  run_attempt: "1",
};
async function runnerRequest(changes: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    ...validClaims,
    iss: "https://token.actions.githubusercontent.com",
    aud: origin,
    iat: now,
    exp: now + 300,
    ...changes,
  })
    .setProtectedHeader({ alg: "RS256", kid: "fixture-key" })
    .sign(keys.privateKey);
  return new Request(`${origin}/api/publish/${crypto.randomUUID()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

test("accepts the immutable subject used by newly created GitHub repositories", async () => {
  await expect(
    verifyRunner(
      await runnerRequest({ sub: "repo:fixture@42/monte@123:ref:refs/heads/main" }),
      settings(),
    ),
  ).resolves.toEqual({ runId: "456", runAttempt: "1" });
});

test("rejects a runner when no subject has been configured", async () => {
  await expect(
    verifyRunner(await runnerRequest(), { ...settings(), GITHUB_OIDC_SUB: "" }),
  ).rejects.toMatchObject({ status: 403, code: "runner_claims" });
});

test.each([
  ["repository_id", "999"],
  ["repository", "other/repository"],
  ["ref", "refs/heads/other"],
  ["workflow_ref", `${repository}/.github/workflows/ci.yml@refs/heads/main`],
  ["event_name", "pull_request"],
  ["sub", `repo:${repository}:pull_request`],
  ["sub", `repo:${repository}:ref:refs/heads/main`],
  ["sub", "repo:fixture@99/monte@123:ref:refs/heads/main"],
  ["sub", "repo:fixture@42/monte@999:ref:refs/heads/main"],
  ["run_id", "456/../../secret"],
  ["run_attempt", 1],
])("rejects a signed but unauthorized %s claim", async (key, value) => {
  await expect(
    verifyRunner(await runnerRequest({ [key]: value }), settings()),
  ).rejects.toMatchObject({ status: 403, code: "runner_claims" });
});

test.each([
  { aud: "https://other.example" },
  { iss: "https://evil.example" },
  { exp: 1 },
  { iat: 1 },
])("rejects a token with invalid audience, issuer or lifetime: %j", async (claims) => {
  await expect(verifyRunner(await runnerRequest(claims), settings())).rejects.toMatchObject({
    status: 401,
    code: "runner_auth",
  });
});

test("rejects an unsigned bearer value", async () => {
  const request = new Request(origin, { headers: { Authorization: "Bearer not-a-jwt" } });
  await expect(verifyRunner(request, settings())).rejects.toMatchObject({
    status: 401,
    code: "runner_auth",
  });
});
