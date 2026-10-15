import { importPKCS8, SignJWT, createRemoteJWKSet, jwtVerify } from "jose";
import { parse } from "yaml";
import { contentDefinitions, getContentPath, parseContent } from "../src/admin/content-model";
import type { ContentSnapshot } from "../src/admin/types";
import type { Env } from "./env";
import { decode64, HttpError, requireCondition } from "./http";

type TreeEntry = { path: string; type: string; sha: string; size?: number; mode: string };
export type RepositorySnapshot = ContentSnapshot & { files: Map<string, TreeEntry> };
const jwks = createRemoteJWKSet(
  new URL("https://token.actions.githubusercontent.com/.well-known/jwks"),
);

export class GitHub {
  private token?: { value: string; expires: number };
  private blobs = new Map<string, Uint8Array<ArrayBuffer>>();
  constructor(private env: Env) {}
  private async installationToken() {
    if (this.token && this.token.expires > Date.now() + 60_000) return this.token.value;
    requireCondition(
      this.env.GITHUB_APP_PRIVATE_KEY && this.env.GITHUB_APP_ID && this.env.GITHUB_INSTALLATION_ID,
      503,
      "github_setup",
      "Die Veröffentlichung wird noch eingerichtet.",
    );
    const key = await importPKCS8(this.env.GITHUB_APP_PRIVATE_KEY, "RS256");
    const now = Math.floor(Date.now() / 1000);
    const jwt = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(this.env.GITHUB_APP_ID)
      .setIssuedAt(now - 30)
      .setExpirationTime(now + 540)
      .sign(key);
    const result = await this.request<{ token: string; expires_at: string }>(
      `/app/installations/${this.env.GITHUB_INSTALLATION_ID}/access_tokens`,
      {
        method: "POST",
        body: JSON.stringify({
          repository_ids: [Number(this.env.GITHUB_REPOSITORY_ID)],
          permissions: { contents: "read", actions: "write" },
        }),
      },
      jwt,
    );
    this.token = { value: result.token, expires: Date.parse(result.expires_at) };
    return result.token;
  }
  private async request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
    const response = await fetch(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token ?? (await this.installationToken())}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Monte-Verwaltung",
        "Content-Type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok)
      throw new HttpError(
        503,
        "github_unavailable",
        `GitHub ist gerade nicht verfügbar (${response.status}). Bitte später erneut versuchen.`,
      );
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  }
  private repoPath(path: string) {
    return `/repos/${this.env.GITHUB_REPOSITORY}${path}`;
  }
  async head() {
    return (await this.request<{ object: { sha: string } }>(this.repoPath("/git/ref/heads/main")))
      .object.sha;
  }
  async blob(sha: string) {
    requireCondition(/^[a-f0-9]{40}$/.test(sha), 400, "blob", "Ungültige Dateiversion.");
    if (this.blobs.has(sha)) return this.blobs.get(sha)!;
    const blob = await this.request<{ content: string; encoding: string; size: number }>(
      this.repoPath(`/git/blobs/${sha}`),
    );
    requireCondition(
      blob.encoding === "base64" && blob.size <= 10 * 1024 * 1024,
      413,
      "blob_size",
      "Datei zu groß für die Verwaltung.",
    );
    const bytes = decode64(blob.content.replaceAll("\n", ""));
    if (bytes.length < 200_000) {
      if (this.blobs.size > 300) this.blobs.clear();
      this.blobs.set(sha, bytes);
    }
    return bytes;
  }
  async snapshot(): Promise<RepositorySnapshot> {
    const revision = await this.head();
    const tree = await this.request<{ tree: TreeEntry[]; truncated: boolean }>(
      this.repoPath(`/git/trees/${revision}?recursive=1`),
    );
    requireCondition(
      !tree.truncated,
      503,
      "tree_size",
      "Das Inhaltsverzeichnis konnte nicht vollständig geladen werden.",
    );
    const files = new Map(
      tree.tree.filter((e) => e.type === "blob" && e.mode === "100644").map((e) => [e.path, e]),
    );
    const snapshot: RepositorySnapshot = { revision, records: [], files };
    const contents = contentDefinitions.flatMap((definition) =>
      [...files.values()]
        .filter((entry) =>
          definition.singleton
            ? entry.path === `${definition.directory}/${definition.singleton}.yml`
            : entry.path.startsWith(`${definition.directory}/`) && entry.path.endsWith(".yml"),
        )
        .map((entry) => ({ definition, entry })),
    );
    const currentBlobs = new Set(contents.map(({ entry }) => entry.sha));
    for (const sha of this.blobs.keys()) if (!currentBlobs.has(sha)) this.blobs.delete(sha);
    const missing = contents.filter(({ entry }) => !this.blobs.has(entry.sha));
    // Batch immutable blobs in GraphQL to stay well below Free subrequest limits.
    const [owner, name] = this.env.GITHUB_REPOSITORY.split("/");
    for (let offset = 0; offset < missing.length; offset += 30) {
      const batch = missing.slice(offset, offset + 30);
      const fields = batch
        .map(
          ({ entry }, i) =>
            `b${i}: object(oid: ${JSON.stringify(entry.sha)}) { ... on Blob { oid text byteSize } }`,
        )
        .join("\n");
      const result = await this.request<{
        data?: {
          repository: Record<string, { oid: string; text: string | null; byteSize: number }>;
        };
        errors?: unknown[];
      }>("/graphql", {
        method: "POST",
        body: JSON.stringify({
          query: `query { repository(owner:${JSON.stringify(owner)}, name:${JSON.stringify(name)}) { ${fields} } }`,
        }),
      });
      requireCondition(
        !result.errors && result.data?.repository,
        503,
        "content_read",
        "Die Inhalte konnten nicht geladen werden.",
      );
      for (let i = 0; i < batch.length; i++) {
        const blob = result.data.repository[`b${i}`];
        requireCondition(
          blob?.oid === batch[i].entry.sha &&
            typeof blob.text === "string" &&
            blob.byteSize <= 200_000,
          503,
          "content_read",
          "Eine Inhaltsdatei konnte nicht gelesen werden.",
        );
        this.blobs.set(blob.oid, new TextEncoder().encode(blob.text));
      }
    }
    for (const { definition, entry } of contents) {
      const id = entry.path.slice(definition.directory.length + 1, -4);
      requireCondition(
        getContentPath(definition.collection, id) === entry.path,
        503,
        "content_path",
        "Ein Inhaltsdateiname ist ungültig.",
      );
      const data = parseContent(
        definition.collection,
        id,
        parse(new TextDecoder().decode(this.blobs.get(entry.sha)!)),
      );
      snapshot.records.push({ collection: definition.collection, id, version: entry.sha, data });
    }
    return snapshot;
  }
  async dispatch(changeId: string, attempt: string) {
    await this.request(this.repoPath("/actions/workflows/publish.yml/dispatches"), {
      method: "POST",
      body: JSON.stringify({ ref: "main", inputs: { change_id: changeId, attempt } }),
    });
  }
  async run(runId: string): Promise<{ status: string; conclusion: string | null }> {
    return this.request(this.repoPath(`/actions/runs/${runId}`));
  }
}

export async function verifyRunner(request: Request, env: Env) {
  const bearer = request.headers.get("Authorization");
  requireCondition(
    bearer && bearer.startsWith("Bearer ") && bearer.length < 20_000,
    401,
    "runner_auth",
    "Veröffentlichung nicht autorisiert.",
  );
  let claims;
  try {
    claims = (
      await jwtVerify(bearer.slice(7), jwks, {
        issuer: "https://token.actions.githubusercontent.com",
        audience: env.ADMIN_ORIGIN,
        algorithms: ["RS256"],
        maxTokenAge: "10m",
      })
    ).payload;
  } catch {
    throw new HttpError(401, "runner_auth", "Veröffentlichung nicht autorisiert.");
  }
  requireCondition(
    claims.repository_id === env.GITHUB_REPOSITORY_ID &&
      claims.repository === env.GITHUB_REPOSITORY &&
      claims.ref === "refs/heads/main" &&
      claims.workflow_ref ===
        `${env.GITHUB_REPOSITORY}/.github/workflows/publish.yml@refs/heads/main` &&
      claims.event_name === "workflow_dispatch" &&
      Boolean(env.GITHUB_OIDC_SUB) &&
      claims.sub === env.GITHUB_OIDC_SUB,
    403,
    "runner_claims",
    "Dieser Workflow darf nicht veröffentlichen.",
  );
  requireCondition(
    typeof claims.run_id === "string" &&
      /^\d+$/.test(claims.run_id) &&
      typeof claims.run_attempt === "string" &&
      /^\d+$/.test(claims.run_attempt),
    403,
    "runner_claims",
    "Workflow-Kennung fehlt.",
  );
  return { runId: claims.run_id, runAttempt: claims.run_attempt };
}
