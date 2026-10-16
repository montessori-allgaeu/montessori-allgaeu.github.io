import { env, exports } from "cloudflare:workers";
import { reset, runInDurableObject } from "cloudflare:test";
import { afterEach, expect, test, vi } from "vitest";
import type { Env } from "./env";
import { hash, randomToken } from "./http";
import { Store } from "./store";
import { testPasskey } from "./test-passkey";
import type { InvitationResult, SessionInfo } from "../src/admin/types";
import { Auth } from "./auth";

declare module "cloudflare:workers" {
  interface ProvidedEnv extends Env {}
}
const origin = "https://verwaltung.example.test";
const worker = exports.default;
afterEach(async () => {
  vi.restoreAllMocks();
  await reset();
});
async function api(
  path: string,
  body?: unknown,
  cookies = "",
  csrf?: string,
  method = body === undefined ? "GET" : "POST",
  requestOrigin = origin,
) {
  return worker.fetch(`${origin}/api/${path}`, {
    method,
    headers: {
      Origin: requestOrigin,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(cookies ? { Cookie: cookies } : {}),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function responseCookie(response: Response) {
  return response.headers.get("set-cookie")!.split(";")[0];
}
async function seedInvitation(role: "admin" | "content-manager" = "admin") {
  const token = randomToken();
  const tokenHash = await hash(token);
  const userId = crypto.randomUUID();
  await runInDurableObject(env.ADMIN.getByName("monte"), (_instance, ctx) => {
    const store = new Store(ctx.storage.sql);
    store.put(`user:${userId}`, {
      id: userId,
      name: "Testperson",
      role,
      active: false,
      createdAt: new Date().toISOString(),
    });
    store.put(
      `invite:${tokenHash}`,
      {
        id: crypto.randomUUID(),
        userId,
        name: "Testperson",
        role,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        tokenHash,
      },
      Date.now() + 60_000,
    );
  });
  return { token, userId };
}
async function enroll(role: "admin" | "content-manager" = "admin") {
  const invitation = await seedInvitation(role);
  const key = await testPasskey();
  const start = await api("enroll/options", { token: invitation.token });
  expect(start.status).toBe(200);
  const options = await start.json<{
    challengeId: string;
    options: {
      challenge: string;
      authenticatorSelection: { residentKey: string; userVerification: string };
    };
  }>();
  expect(options.options.authenticatorSelection).toMatchObject({
    residentKey: "required",
    userVerification: "required",
  });
  const flow = responseCookie(start);
  const response = await key.register(options.options.challenge);
  const finish = await api(
    "enroll/verify",
    { token: invitation.token, challengeId: options.challengeId, response, label: "Testgerät" },
    flow,
  );
  expect(finish.status).toBe(200);
  const info = await finish.json<SessionInfo>();
  return { ...invitation, key, info, cookies: `${flow}; ${responseCookie(finish)}` };
}

test("discovers a passkey without username and verifies a real signature; challenge cannot replay", async () => {
  const account = await enroll();
  expect(account.info.user.passkeyCount).toBe(1);
  const loggedOut = await api("logout", {}, account.cookies, account.info.csrfToken);
  expect(loggedOut.status).toBe(200);
  const start = await api("auth/options", {});
  const options = await start.json<{
    challengeId: string;
    options: { challenge: string; allowCredentials?: unknown[]; userVerification: string };
  }>();
  expect(options.options.allowCredentials ?? []).toEqual([]);
  expect(options.options.userVerification).toBe("required");
  const response = await account.key.authenticate(options.options.challenge, account.userId);
  const body = { challengeId: options.challengeId, response };
  const flow = responseCookie(start);
  const login = await api("auth/verify", body, flow);
  expect(login.status).toBe(200);
  expect(login.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Strict");
  expect(login.headers.get("set-cookie")).toContain("Secure");
  expect((await api("auth/verify", body, flow)).status).toBe(400);
  expect((await api("enroll/options", { token: account.token })).status).toBe(410);
});

test("rejects cross-origin enrollment, absent user verification and challenge from another browser", async () => {
  const invitation = await seedInvitation();
  const key = await testPasskey();
  expect(
    (
      await api(
        "enroll/options",
        { token: invitation.token },
        "",
        undefined,
        "POST",
        "https://evil.example",
      )
    ).status,
  ).toBe(403);
  const start = await api("enroll/options", { token: invitation.token });
  const data = await start.json<{ challengeId: string; options: { challenge: string } }>();
  const response = await key.register(data.options.challenge);
  expect(
    (
      await api("enroll/verify", {
        token: invitation.token,
        challengeId: data.challengeId,
        response,
        label: "Other browser",
      })
    ).status,
  ).toBe(400);
  const second = await api("enroll/options", { token: invitation.token });
  const next = await second.json<{ challengeId: string; options: { challenge: string } }>();
  expect(
    (
      await api(
        "enroll/verify",
        {
          token: invitation.token,
          challengeId: next.challengeId,
          response: await key.register(next.options.challenge, false),
          label: "No verification",
        },
        responseCookie(second),
      )
    ).status,
  ).toBe(400);
});

test("content managers cannot invite, change roles or reset accesses; every mutation requires CSRF", async () => {
  const account = await enroll("content-manager");
  expect((await api("access", undefined, account.cookies)).status).toBe(403);
  expect(
    (
      await api(
        "invitations",
        { name: "Other", role: "admin" },
        account.cookies,
        account.info.csrfToken,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await api(
        `access/${account.userId}`,
        { role: "admin" },
        account.cookies,
        account.info.csrfToken,
        "PATCH",
      )
    ).status,
  ).toBe(403);
  expect((await api("logout", {}, account.cookies)).status).toBe(403);
});

test("last usable admin and own last passkey cannot be removed; deactivation immediately revokes sessions", async () => {
  const account = await enroll();
  expect(
    (
      await api(
        `passkeys/${account.key.id}`,
        undefined,
        account.cookies,
        account.info.csrfToken,
        "DELETE",
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await api(
        `access/${account.userId}`,
        { active: false },
        account.cookies,
        account.info.csrfToken,
        "PATCH",
      )
    ).status,
  ).toBe(409);
  const manager = await enroll("content-manager");
  expect(
    (
      await api(
        `access/${manager.userId}`,
        { active: false },
        account.cookies,
        account.info.csrfToken,
        "PATCH",
      )
    ).status,
  ).toBe(200);
  expect((await api("me", undefined, manager.cookies)).status).toBe(401);
  const start = await api("auth/options", {});
  const data = await start.json<{ challengeId: string; options: { challenge: string } }>();
  expect(
    (
      await api(
        "auth/verify",
        {
          challengeId: data.challengeId,
          response: await manager.key.authenticate(data.options.challenge, manager.userId),
        },
        responseCookie(start),
      )
    ).status,
  ).toBe(401);
});

test.each(["invitation", "passkey reset"])(
  "%s links remain usable for exactly 14 days",
  async (kind) => {
    const admin = await enroll();
    const manager = kind === "passkey reset" ? await enroll("content-manager") : undefined;
    const before = Date.now();
    const response = await api(
      manager ? `access/${manager.userId}/reset` : "invitations",
      manager ? {} : { name: "New person", role: "content-manager" },
      admin.cookies,
      admin.info.csrfToken,
    );
    const after = Date.now();
    expect(response.status).toBe(201);
    const invitation = await response.json<InvitationResult>();
    const expires = Date.parse(invitation.expiresAt);
    const fourteenDays = 14 * 24 * 60 * 60 * 1000;
    expect(expires).toBeGreaterThanOrEqual(before + fourteenDays);
    expect(expires).toBeLessThanOrEqual(after + fourteenDays);
    const token = new URLSearchParams(new URL(invitation.url).hash.slice(1)).get("invite")!;

    await runInDurableObject(env.ADMIN.getByName("monte"), async (_instance, ctx) => {
      const auth = new Auth(new Store(ctx.storage.sql), env);
      const request = new Request(`${origin}/api/enroll/options`, {
        method: "POST",
        headers: { Origin: origin },
      });
      const now = vi.spyOn(Date, "now").mockReturnValue(expires - 1);
      try {
        expect((await auth.enrollOptions(request, { token })).status).toBe(200);
        now.mockReturnValue(expires);
        await expect(auth.enrollOptions(request, { token })).rejects.toMatchObject({
          status: 410,
          code: "invite_expired",
        });
      } finally {
        now.mockRestore();
      }
    });
  },
);

test("sensitive access changes require recent authentication and expired invitations stay unusable", async () => {
  const account = await enroll();
  await runInDurableObject(env.ADMIN.getByName("monte"), (_instance, ctx) => {
    const store = new Store(ctx.storage.sql);
    for (const [id, session] of store.list<{ verifiedAt: number }>("session:"))
      store.put(id, { ...session, verifiedAt: Date.now() - 6 * 60_000 });
  });
  expect(
    (
      await api(
        "invitations",
        { name: "Other", role: "content-manager" },
        account.cookies,
        account.info.csrfToken,
      )
    ).status,
  ).toBe(428);
  const invitation = await seedInvitation();
  const digest = await hash(invitation.token);
  await runInDurableObject(env.ADMIN.getByName("monte"), (_instance, ctx) => {
    new Store(ctx.storage.sql).put(`invite:${digest}`, {}, Date.now() - 1);
  });
  expect((await api("enroll/options", { token: invitation.token })).status).toBe(410);
});

test("unknown API paths return JSON rather than the administration HTML", async () => {
  const account = await enroll();
  const response = await api("does-not-exist", undefined, account.cookies);
  expect(response.status).toBe(404);
  expect(response.headers.get("content-type")).toContain("application/json");
});

test("technical recovery replaces ten lost keys only after successful verification", async () => {
  const account = await enroll();
  const token = randomToken();
  const tokenHash = await hash(token);
  const replacementKey = await testPasskey();
  await runInDurableObject(env.ADMIN.getByName("monte"), async (_instance, ctx) => {
    const store = new Store(ctx.storage.sql);
    const auth = new Auth(store, {
      ...env,
      BOOTSTRAP_TOKEN_HASH: tokenHash,
      BOOTSTRAP_EXPIRES_AT: new Date(Date.now() + 600_000).toISOString(),
      RECOVERY_USER_ID: account.userId,
    });
    const original = store.get<Record<string, unknown>>(`key:${account.key.id}`)!;
    for (let i = 0; i < 9; i++) {
      const id = randomToken();
      store.put(`key:${id}`, { ...original, id });
    }
    const request = new Request(`${origin}/api/enroll/options`, {
      method: "POST",
      headers: { Origin: origin },
    });
    const start = await auth.enrollOptions(request, { token });
    const options = await start.json<{ challengeId: string; options: { challenge: string } }>();
    expect(store.list("key:")).toHaveLength(10);
    const verificationRequest = new Request(`${origin}/api/enroll/verify`, {
      method: "POST",
      headers: { Origin: origin, Cookie: responseCookie(start) },
    });
    await expect(
      auth.enroll(verificationRequest, {
        token,
        challengeId: options.challengeId,
        response: await replacementKey.register(options.options.challenge, false),
      }),
    ).rejects.toMatchObject({ code: "passkey_invalid" });
    expect(store.list("key:")).toHaveLength(10);
    const retry = await auth.enrollOptions(request, { token });
    const retryOptions = await retry.json<{
      challengeId: string;
      options: { challenge: string };
    }>();
    const result = await auth.enroll(
      new Request(`${origin}/api/enroll/verify`, {
        method: "POST",
        headers: { Origin: origin, Cookie: responseCookie(retry) },
      }),
      {
        token,
        challengeId: retryOptions.challengeId,
        response: await replacementKey.register(retryOptions.options.challenge),
      },
    );
    expect(result.status).toBe(200);
    expect(store.list("key:").map(([key]) => key)).toEqual([`key:${replacementKey.id}`]);
    await expect(auth.enrollOptions(request, { token })).rejects.toMatchObject({
      code: "invite_expired",
    });
  });
  expect((await api("me", undefined, account.cookies)).status).toBe(401);
});

test.each(["unused", "used", "deactivated", "admin"])(
  "deleting a %s access removes credentials and links while preserving history and other users",
  async (state) => {
    const admin = await enroll();
    const target =
      state === "unused"
        ? await seedInvitation("content-manager")
        : await enroll(state === "admin" ? "admin" : "content-manager");
    if (state === "deactivated") {
      expect(
        (
          await api(
            `access/${target.userId}`,
            { active: false },
            admin.cookies,
            admin.info.csrfToken,
            "PATCH",
          )
        ).status,
      ).toBe(200);
    }
    const token = randomToken();
    const tokenHash = await hash(token);
    await runInDurableObject(env.ADMIN.getByName("monte"), (_instance, ctx) => {
      const store = new Store(ctx.storage.sql);
      store.put(
        `invite:${tokenHash}`,
        {
          id: crypto.randomUUID(),
          userId: target.userId,
          tokenHash,
          name: "Testperson",
          role: "content-manager",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
        Date.now() + 60_000,
      );
      store.put("audit:previous", {
        actor: target.userId,
        action: "content_saved",
        target: "previous",
      });
      store.put("change:previous", { ownerId: target.userId, status: "published" });
    });
    const enrollment = await api("enroll/options", { token });
    const registration = await enrollment.json<{
      challengeId: string;
      options: { challenge: string };
    }>();
    const newKey = await testPasskey();
    const registered = await newKey.register(registration.options.challenge);
    const authentication = await api("auth/options", {});
    const challenge = await authentication.json<{
      challengeId: string;
      options: { challenge: string };
    }>();

    const removed = await api(
      `access/${target.userId}`,
      undefined,
      admin.cookies,
      admin.info.csrfToken,
      "DELETE",
    );
    expect(removed.status).toBe(200);
    const access = await (
      await api("access", undefined, admin.cookies)
    ).json<{ users: { id: string }[]; invitations: { userId: string }[] }>();
    expect(access.users.map((u) => u.id)).toEqual([admin.userId]);
    expect(access.invitations).toEqual([]);
    expect((await api("me", undefined, admin.cookies)).status).toBe(200);
    expect((await api("enroll/options", { token })).status).toBe(410);
    expect(
      (
        await api(
          "enroll/verify",
          { token, challengeId: registration.challengeId, response: registered },
          responseCookie(enrollment),
        )
      ).status,
    ).toBe(410);
    if ("cookies" in target) {
      expect((await api("me", undefined, target.cookies)).status).toBe(401);
      const response = await target.key.authenticate(challenge.options.challenge, target.userId);
      expect(
        (
          await api(
            "auth/verify",
            { challengeId: challenge.challengeId, response },
            responseCookie(authentication),
          )
        ).status,
      ).toBe(401);
    }
    await runInDurableObject(env.ADMIN.getByName("monte"), (_instance, ctx) => {
      const store = new Store(ctx.storage.sql);
      expect(store.get(`user:${target.userId}`)).toBeUndefined();
      for (const prefix of ["key:", "session:", "invite:", "challenge:"]) {
        expect(
          store
            .list<{ userId?: string }>(prefix)
            .filter(([, value]) => value.userId === target.userId),
        ).toEqual([]);
      }
      expect(store.get("change:previous")).toEqual({ ownerId: target.userId, status: "published" });
      expect(store.get("audit:previous")).toEqual({
        actor: target.userId,
        action: "content_saved",
        target: "previous",
      });
      expect(store.list("audit:").map(([, value]) => value)).toContainEqual(
        expect.objectContaining({
          actor: admin.userId,
          action: "access_deleted",
          target: target.userId,
        }),
      );
    });
  },
);

test("access deletion requires admin, CSRF, same origin and fresh authentication", async () => {
  const admin = await enroll();
  const manager = await enroll("content-manager");
  const target = await seedInvitation("content-manager");
  const path = `access/${target.userId}`;
  expect((await api(path, undefined, "", undefined, "DELETE")).status).toBe(401);
  expect(
    (await api(path, undefined, manager.cookies, manager.info.csrfToken, "DELETE")).status,
  ).toBe(403);
  expect((await api(path, undefined, admin.cookies, undefined, "DELETE")).status).toBe(403);
  expect(
    (
      await api(
        path,
        undefined,
        admin.cookies,
        admin.info.csrfToken,
        "DELETE",
        "https://evil.example",
      )
    ).status,
  ).toBe(403);
  await runInDurableObject(env.ADMIN.getByName("monte"), (_instance, ctx) => {
    const store = new Store(ctx.storage.sql);
    for (const [id, value] of store.list<{ userId: string; verifiedAt: number }>("session:"))
      if (value.userId === admin.userId)
        store.put(id, { ...value, verifiedAt: Date.now() - 5 * 60_000 });
  });
  expect((await api(path, undefined, admin.cookies, admin.info.csrfToken, "DELETE")).status).toBe(
    428,
  );
  const access = await (
    await api("access", undefined, admin.cookies)
  ).json<{ users: { id: string }[] }>();
  expect(access.users.map((u) => u.id)).toContain(target.userId);
});

test("self deletion preserves the last usable admin and logs out a departing admin", async () => {
  const admin = await enroll();
  const path = `access/${admin.userId}`;
  const blocked = await api(path, undefined, admin.cookies, admin.info.csrfToken, "DELETE");
  expect(blocked.status).toBe(409);
  expect(await blocked.json()).toMatchObject({ code: "last_admin" });
  expect((await api("me", undefined, admin.cookies)).status).toBe(200);
  const remaining = await enroll();
  expect((await api(path, undefined, admin.cookies, admin.info.csrfToken, "DELETE")).status).toBe(
    200,
  );
  expect((await api("me", undefined, admin.cookies)).status).toBe(401);
  expect((await api("me", undefined, remaining.cookies)).status).toBe(200);
  expect(
    (await api(path, undefined, remaining.cookies, remaining.info.csrfToken, "DELETE")).status,
  ).toBe(404);
});
