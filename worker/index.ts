import { DurableObject } from "cloudflare:workers";
import { z } from "zod";
import { Auth } from "./auth";
import type { Env } from "./env";
import { GitHub } from "./github";
import { HttpError, json, readJson, requireCondition, secured } from "./http";
import { Publishing } from "./publishing";
import { Store } from "./store";

export class MonteAdmin extends DurableObject<Env> {
  private store: Store;
  private auth: Auth;
  private publishing: Publishing;
  private tail: Promise<void> = Promise.resolve();
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new Store(ctx.storage.sql);
    this.auth = new Auth(this.store, env);
    this.publishing = new Publishing(this.store, env, new GitHub(env), this.auth, ctx.storage);
  }
  // Requests that verify credentials or await GitHub must not interleave state transitions.
  private async exclusive<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }
  async fetch(request: Request): Promise<Response> {
    return this.exclusive(async () => {
      try {
        return secured(await this.route(request));
      } catch (error) {
        if (error instanceof z.ZodError)
          return secured(
            json(
              {
                error: "Bitte die markierten Angaben prüfen.",
                code: "validation",
                fields: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
              },
              400,
            ),
          );
        if (error instanceof HttpError)
          return secured(json({ error: error.message, code: error.code }, error.status));
        // Neither WebAuthn payloads, tokens nor content are written to provider logs.
        return secured(
          json(
            {
              error: "Die Verwaltung ist gerade nicht verfügbar. Bitte gleich erneut versuchen.",
              code: "unavailable",
            },
            503,
          ),
        );
      }
    });
  }
  private async route(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;
    requireCondition(
      url.origin === this.env.ADMIN_ORIGIN,
      403,
      "host",
      "Diese Verwaltungsadresse ist nicht eingerichtet.",
    );
    if (path === "/api/health" && method === "GET") return json({ ok: true });
    if (path.startsWith("/api/publish/"))
      return this.publishing.runner(
        request,
        url,
        method === "POST" ? await readJson(request) : undefined,
      );
    if (method === "POST" && path === "/api/auth/options") return this.auth.authOptions(request);
    if (method === "POST" && path === "/api/auth/verify")
      return this.auth.authenticate(request, await readJson(request));
    if (method === "POST" && path === "/api/enroll/options")
      return this.auth.enrollOptions(request, await readJson(request));
    if (method === "POST" && path === "/api/enroll/verify")
      return this.auth.enroll(request, await readJson(request));
    const current = await this.auth.session(request);
    requireCondition(current, 401, "login_required", "Bitte anmelden.");
    const { user, session } = current;
    if (!["GET", "HEAD"].includes(method)) this.auth.mutation(request, session);
    if (path === "/api/me" && method === "GET") return json(this.auth.info(session));
    if (path === "/api/logout" && method === "POST") return this.auth.logout(session);
    if (path === "/api/passkeys/options" && method === "POST")
      return this.auth.addOptions(request, user, session);
    if (path === "/api/passkeys/verify" && method === "POST")
      return this.auth.addKey(request, await readJson(request), user, session);
    if (path.startsWith("/api/passkeys/") && method === "DELETE")
      return this.auth.removeKey(path.slice("/api/passkeys/".length), user, session);
    if (path === "/api/content" && method === "GET") return this.publishing.content();
    if (path === "/api/changes" && method === "GET") return this.publishing.list();
    if (path === "/api/changes" && method === "POST")
      return this.publishing.submit(await readJson(request), user, session);
    const retry = /^\/api\/changes\/([a-f0-9-]{36})\/retry$/.exec(path);
    if (retry && method === "POST") return this.publishing.retry(retry[1], user, session);
    if (path === "/api/access" && method === "GET") return this.auth.access(user);
    if (path === "/api/invitations" && method === "POST")
      return this.auth.invite(await readJson(request), user, session);
    const invitation = /^\/api\/invitations\/([a-f0-9-]{36})$/.exec(path);
    if (invitation && method === "DELETE")
      return this.auth.cancelInvite(invitation[1], user, session);
    const access = /^\/api\/access\/([a-f0-9-]{36})(\/reset)?$/.exec(path);
    if (access && !access[2] && method === "PATCH")
      return this.auth.patchAccess(access[1], await readJson(request), user, session);
    if (access && access[2] && method === "POST")
      return this.auth.resetAccess(access[1], user, session);
    if (path === "/api/uploads" && method === "POST") return this.publishing.upload(request, user);
    const upload = /^\/api\/uploads\/([a-f0-9-]{36})$/.exec(path);
    if (upload && method === "GET") return this.publishing.uploadPreview(upload[1], user);
    if (path === "/api/media" && method === "GET") return this.publishing.media(url);
    throw new HttpError(404, "not_found", "API-Pfad nicht gefunden.");
  }
  async alarm() {
    await this.exclusive(async () => {
      try {
        await this.publishing.tick();
      } catch {
        await this.ctx.storage.setAlarm(Date.now() + 5 * 60_000);
      }
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname.startsWith("/api/"))
      return env.ADMIN.getByName("monte").fetch(request);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
