import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { z } from "zod";
import type {
  AccessUser,
  InvitationInfo,
  InvitationResult,
  PasskeyInfo,
  SessionInfo,
} from "../src/admin/types";
import type { Env } from "./env";
import {
  base64url,
  cookie,
  cookieName,
  cookieValue,
  decode64,
  hash,
  HttpError,
  json,
  randomToken,
  requireCondition,
  sameOrigin,
} from "./http";
import {
  accessPatchSchema,
  invitationSchema,
  preserveLastAdmin,
  requireAdmin,
  requireFresh,
} from "./policy";
import { Store } from "./store";

type User = Omit<AccessUser, "passkeyCount">;
type Passkey = PasskeyInfo & {
  userId: string;
  publicKey: string;
  counter: number;
  transports?: string[];
};
export type Session = {
  id: string;
  userId: string;
  csrfToken: string;
  createdAt: number;
  lastSeen: number;
  verifiedAt: number;
};
type Challenge = {
  challenge: string;
  purpose: "auth" | "enroll" | "add";
  binding: string;
  userId?: string;
  inviteHash?: string;
};
type Invitation = InvitationInfo & { tokenHash: string; bootstrap?: boolean };
const DAY = 86400_000;
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const challengeSchema = z.object({ challengeId: z.uuid(), response: z.unknown() });
const responseBase = {
  id: z.string().regex(/^[A-Za-z0-9_-]{1,2048}$/),
  rawId: z.string().max(2048),
  type: z.literal("public-key"),
  clientExtensionResults: z.record(z.string(), z.unknown()),
};
const registrationResponse = z
  .object({
    ...responseBase,
    response: z
      .object({
        clientDataJSON: z.string().max(20_000),
        attestationObject: z.string().max(100_000),
        transports: z.array(z.string().max(30)).max(8).optional(),
      })
      .passthrough(),
  })
  .passthrough();
const authenticationResponse = z
  .object({
    ...responseBase,
    response: z.object({
      clientDataJSON: z.string().max(20_000),
      authenticatorData: z.string().max(20_000),
      signature: z.string().max(20_000),
      userHandle: z.string().max(200).optional(),
    }),
  })
  .passthrough();

export class Auth {
  constructor(
    private store: Store,
    private env: Env,
  ) {}
  passkeys(userId: string) {
    return this.store
      .list<Passkey>("key:")
      .map(([, k]) => k)
      .filter((k) => k.userId === userId);
  }
  user(userId: string): AccessUser | undefined {
    const user = this.store.get<User>(`user:${userId}`);
    return user ? { ...user, passkeyCount: this.passkeys(userId).length } : undefined;
  }
  users() {
    return this.store
      .list<User>("user:")
      .map(([, u]) => ({ ...u, passkeyCount: this.passkeys(u.id).length }));
  }
  audit(actor: string, action: string, target: string) {
    this.store.put(
      `audit:${Date.now()}:${crypto.randomUUID()}`,
      { actor, action, target, at: new Date().toISOString() },
      Date.now() + 180 * DAY,
    );
  }
  async rate(request: Request, bucket: string, limit = 20, window = 60_000) {
    const address = request.headers.get("CF-Connecting-IP") ?? "local";
    const suffix = await hash(address);
    this.limit(`ip:${bucket}:${suffix}`, limit, window);
    this.limit(`global:${bucket}`, limit * 10, window);
  }
  limit(bucket: string, limit: number, window: number) {
    const slot = Math.floor(Date.now() / window);
    const key = `rate:${bucket}:${slot}`;
    const count = this.store.get<number>(key) ?? 0;
    requireCondition(
      count < limit,
      429,
      "rate_limit",
      "Bitte warte einen Moment und versuche es erneut.",
    );
    this.store.put(key, count + 1, (slot + 1) * window);
  }
  async session(
    request: Request,
    required = true,
  ): Promise<{ session: Session; user: AccessUser } | undefined> {
    const raw = cookieValue(request, cookieName(this.env.ADMIN_ORIGIN, "session"));
    const id = raw && tokenSchema.safeParse(raw).success ? await hash(raw) : undefined;
    const session = id ? this.store.get<Session>(`session:${id}`) : undefined;
    const user = session ? this.user(session.userId) : undefined;
    if (
      !session ||
      !user?.active ||
      Date.now() - session.createdAt >= 30 * DAY ||
      Date.now() - session.lastSeen >= 7 * DAY
    ) {
      if (id) this.store.delete(`session:${id}`);
      if (required)
        throw new HttpError(401, "login_required", "Bitte mit deinem Passkey anmelden.");
      return undefined;
    }
    if (Date.now() - session.lastSeen > 3600_000) {
      session.lastSeen = Date.now();
      this.store.put(`session:${session.id}`, session, session.createdAt + 30 * DAY);
    }
    return { session, user };
  }
  mutation(request: Request, session: Session) {
    sameOrigin(request, this.env.ADMIN_ORIGIN);
    requireCondition(
      request.headers.get("X-CSRF-Token") === session.csrfToken,
      403,
      "csrf",
      "Bitte lade die Verwaltung neu.",
    );
  }
  info(session: Session): SessionInfo {
    const user = this.user(session.userId);
    requireCondition(user, 401, "user_missing", "Bitte erneut anmelden.");
    return {
      user,
      csrfToken: session.csrfToken,
      expiresAt: new Date(
        Math.min(session.createdAt + 30 * DAY, session.lastSeen + 7 * DAY),
      ).toISOString(),
      passkeys: this.passkeys(user.id).map(({ id, label, createdAt, lastUsedAt }) => ({
        id,
        label,
        createdAt,
        lastUsedAt,
      })),
    };
  }
  private async login(userId: string, request: Request) {
    const previous = await this.session(request, false);
    if (previous) this.store.delete(`session:${previous.session.id}`);
    const token = randomToken();
    const id = await hash(token);
    const now = Date.now();
    const session: Session = {
      id,
      userId,
      csrfToken: randomToken(),
      createdAt: now,
      lastSeen: now,
      verifiedAt: now,
    };
    const oldSessions = this.store
      .list<Session>("session:")
      .filter(([, s]) => s.userId === userId)
      .sort((a, b) => a[1].createdAt - b[1].createdAt);
    for (const [key] of oldSessions.slice(0, Math.max(0, oldSessions.length - 19)))
      this.store.delete(key);
    this.store.put(`session:${id}`, session, now + 30 * DAY);
    const user = this.store.get<User>(`user:${userId}`)!;
    this.store.put(`user:${userId}`, { ...user, lastLoginAt: new Date(now).toISOString() });
    return json(this.info(session), 200, {
      "Set-Cookie": cookie(
        cookieName(this.env.ADMIN_ORIGIN, "session"),
        token,
        30 * 86400,
        this.env.ADMIN_ORIGIN,
      ),
    });
  }
  private async challenge(request: Request, data: Omit<Challenge, "binding">) {
    const name = cookieName(this.env.ADMIN_ORIGIN, "flow");
    const existing = cookieValue(request, name);
    const binding = existing && tokenSchema.safeParse(existing).success ? existing : randomToken();
    const id = crypto.randomUUID();
    this.store.put(
      `challenge:${id}`,
      { ...data, binding: await hash(binding) },
      Date.now() + 120_000,
    );
    return { id, header: cookie(name, binding, 600, this.env.ADMIN_ORIGIN) };
  }
  private async consumeChallenge(request: Request, id: string, purpose: Challenge["purpose"]) {
    const challenge = this.store.get<Challenge>(`challenge:${id}`);
    this.store.delete(`challenge:${id}`);
    const binding = cookieValue(request, cookieName(this.env.ADMIN_ORIGIN, "flow"));
    requireCondition(
      challenge &&
        challenge.purpose === purpose &&
        binding &&
        challenge.binding === (await hash(binding)),
      400,
      "challenge_expired",
      "Die Passkey-Anfrage ist abgelaufen. Bitte erneut versuchen.",
    );
    return challenge;
  }
  async authOptions(request: Request) {
    sameOrigin(request, this.env.ADMIN_ORIGIN);
    await this.rate(request, "auth", 15);
    const current = await this.session(request, false);
    const options = await generateAuthenticationOptions({
      rpID: this.env.RP_ID,
      userVerification: "required",
      timeout: 120_000,
    });
    const challenge = await this.challenge(request, {
      purpose: "auth",
      challenge: options.challenge,
      userId: current?.user.id,
    });
    return json({ challengeId: challenge.id, options }, 200, { "Set-Cookie": challenge.header });
  }
  async authenticate(request: Request, body: unknown) {
    sameOrigin(request, this.env.ADMIN_ORIGIN);
    await this.rate(request, "verify", 20);
    const { challengeId, response: raw } = challengeSchema.parse(body);
    const response = authenticationResponse.parse(raw) as AuthenticationResponseJSON;
    const challenge = await this.consumeChallenge(request, challengeId, "auth");
    const passkey = this.store.get<Passkey>(`key:${response.id}`);
    const user = passkey ? this.user(passkey.userId) : undefined;
    requireCondition(
      passkey && user?.active && (!challenge.userId || challenge.userId === user.id),
      401,
      "passkey_invalid",
      "Dieser Passkey kann hier nicht verwendet werden.",
    );
    requireCondition(
      response.response.userHandle === base64url(new TextEncoder().encode(user.id)),
      401,
      "passkey_invalid",
      "Dieser Passkey kann hier nicht verwendet werden.",
    );
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: this.env.ADMIN_ORIGIN,
        expectedRPID: this.env.RP_ID,
        credential: {
          id: passkey.id,
          publicKey: decode64(passkey.publicKey),
          counter: passkey.counter,
          transports: passkey.transports,
        },
        requireUserVerification: true,
      });
    } catch {
      throw new HttpError(401, "passkey_invalid", "Der Passkey konnte nicht bestätigt werden.");
    }
    requireCondition(
      verification.verified,
      401,
      "passkey_invalid",
      "Der Passkey konnte nicht bestätigt werden.",
    );
    this.store.put(`key:${passkey.id}`, {
      ...passkey,
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date().toISOString(),
    });
    this.audit(user.id, "login", user.id);
    return this.login(user.id, request);
  }
  private async invitation(token: string): Promise<Invitation> {
    tokenSchema.parse(token);
    const tokenHash = await hash(token);
    const found = this.store.get<Invitation>(`invite:${tokenHash}`);
    if (found) return found;
    const expires = Date.parse(this.env.BOOTSTRAP_EXPIRES_AT ?? "");
    requireCondition(
      this.env.BOOTSTRAP_TOKEN_HASH === tokenHash &&
        Number.isFinite(expires) &&
        expires > Date.now() &&
        expires <= Date.now() + 15 * 60_000 &&
        !this.store.get(`bootstrap-used:${tokenHash}`),
      410,
      "invite_expired",
      "Dieser Einladungslink ist nicht mehr gültig. Bitte einen neuen Link anfordern.",
    );
    let user: AccessUser | undefined;
    if (this.env.RECOVERY_USER_ID) {
      user = this.user(this.env.RECOVERY_USER_ID);
      requireCondition(
        user?.role === "admin",
        403,
        "recovery_user",
        "Die technische Wiederherstellung ist nicht richtig eingerichtet.",
      );
    } else {
      requireCondition(
        this.users().filter((u) => u.active).length === 0,
        403,
        "bootstrap_closed",
        "Die Ersteinrichtung ist bereits abgeschlossen.",
      );
      const name = this.env.BOOTSTRAP_NAME?.trim();
      requireCondition(name, 503, "bootstrap_name", "Der Name für die Ersteinrichtung fehlt.");
      user = {
        id: crypto.randomUUID(),
        name,
        role: "admin",
        active: false,
        createdAt: new Date().toISOString(),
        passkeyCount: 0,
      };
      this.store.put(`user:${user.id}`, user);
    }
    const invitation: Invitation = {
      id: crypto.randomUUID(),
      userId: user.id,
      name: user.name,
      role: "admin",
      expiresAt: new Date(expires).toISOString(),
      tokenHash,
      bootstrap: true,
    };
    this.store.put(`invite:${tokenHash}`, invitation, expires);
    return invitation;
  }
  private async registrationOptions(
    request: Request,
    user: AccessUser,
    purpose: "enroll" | "add",
    inviteHash?: string,
    replacesLostKeys = false,
  ) {
    requireCondition(
      replacesLostKeys || this.passkeys(user.id).length < 10,
      409,
      "passkey_limit",
      "Pro Person sind höchstens zehn Passkeys möglich.",
    );
    const options = await generateRegistrationOptions({
      rpName: "Monte-Verwaltung",
      rpID: this.env.RP_ID,
      userID: new TextEncoder().encode(user.id),
      userName: user.name,
      userDisplayName: user.name,
      attestationType: "none",
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      extensions: { credProps: true },
      excludeCredentials: this.passkeys(user.id).map((k) => ({
        id: k.id,
        transports: k.transports,
      })),
      supportedAlgorithmIDs: [-7, -257],
      timeout: 120_000,
    });
    const challenge = await this.challenge(request, {
      purpose,
      challenge: options.challenge,
      userId: user.id,
      inviteHash,
    });
    return json({ challengeId: challenge.id, options, name: user.name }, 200, {
      "Set-Cookie": challenge.header,
    });
  }
  async enrollOptions(request: Request, body: unknown) {
    sameOrigin(request, this.env.ADMIN_ORIGIN);
    await this.rate(request, "enroll", 10);
    const { token } = z.strictObject({ token: tokenSchema }).parse(body);
    const invite = await this.invitation(token);
    const user = this.user(invite.userId);
    requireCondition(user, 410, "invite_expired", "Dieser Einladungslink ist nicht mehr gültig.");
    return this.registrationOptions(
      request,
      user,
      "enroll",
      invite.tokenHash,
      invite.bootstrap === true && this.env.RECOVERY_USER_ID === user.id,
    );
  }
  private async verifyRegistration(
    request: Request,
    raw: unknown,
    purpose: "enroll" | "add",
    userId: string,
    inviteHash?: string,
  ) {
    const body = challengeSchema
      .extend({ label: z.string().trim().min(1).max(80).default("Mein Passkey") })
      .parse(raw);
    const response = registrationResponse.parse(body.response) as RegistrationResponseJSON;
    const challenge = await this.consumeChallenge(request, body.challengeId, purpose);
    requireCondition(
      challenge.userId === userId && challenge.inviteHash === inviteHash,
      403,
      "challenge_user",
      "Die Passkey-Anfrage passt nicht zu diesem Zugang.",
    );
    requireCondition(
      !this.store.get(`key:${response.id}`),
      409,
      "passkey_exists",
      "Dieser Passkey ist bereits hinterlegt.",
    );
    let result;
    try {
      result = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: this.env.ADMIN_ORIGIN,
        expectedRPID: this.env.RP_ID,
        requireUserVerification: true,
        supportedAlgorithmIDs: [-7, -257],
      });
    } catch {
      throw new HttpError(
        400,
        "passkey_invalid",
        "Der neue Passkey konnte nicht bestätigt werden.",
      );
    }
    requireCondition(
      result.verified,
      400,
      "passkey_invalid",
      "Der neue Passkey konnte nicht bestätigt werden.",
    );
    requireCondition(
      response.clientExtensionResults.credProps?.rk !== false,
      400,
      "resident_key",
      "Bitte einen Passkey verwenden, der ohne Benutzernamen funktioniert.",
    );
    const credential = result.registrationInfo.credential;
    return {
      id: credential.id,
      userId,
      publicKey: base64url(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports,
      label: body.label,
      createdAt: new Date().toISOString(),
    } satisfies Passkey;
  }
  async enroll(request: Request, body: unknown) {
    sameOrigin(request, this.env.ADMIN_ORIGIN);
    await this.rate(request, "enroll-verify", 10);
    const { token } = z.object({ token: tokenSchema }).parse(body);
    const invite = await this.invitation(token);
    const key = await this.verifyRegistration(
      request,
      body,
      "enroll",
      invite.userId,
      invite.tokenHash,
    );
    const user = this.store.get<User>(`user:${invite.userId}`)!;
    if (invite.bootstrap && this.env.RECOVERY_USER_ID) this.revoke(user.id, true);
    this.store.put(`key:${key.id}`, key);
    this.store.put(`user:${user.id}`, { ...user, active: true });
    this.store.delete(`invite:${invite.tokenHash}`);
    if (invite.bootstrap) this.store.put(`bootstrap-used:${invite.tokenHash}`, true);
    this.audit(user.id, invite.bootstrap ? "bootstrap" : "enrolled", user.id);
    return this.login(user.id, request);
  }
  revoke(userId: string, keys = false) {
    for (const [id, s] of this.store.list<Session>("session:"))
      if (s.userId === userId) this.store.delete(id);
    for (const [id, c] of this.store.list<Challenge>("challenge:"))
      if (c.userId === userId) this.store.delete(id);
    for (const [id, i] of this.store.list<Invitation>("invite:"))
      if (i.userId === userId) this.store.delete(id);
    if (keys) for (const key of this.passkeys(userId)) this.store.delete(`key:${key.id}`);
  }
  logout(session: Session) {
    this.store.delete(`session:${session.id}`);
    return json({ ok: true }, 200, {
      "Set-Cookie": cookie(
        cookieName(this.env.ADMIN_ORIGIN, "session"),
        "",
        0,
        this.env.ADMIN_ORIGIN,
      ),
    });
  }
  addOptions(request: Request, user: AccessUser, session: Session) {
    requireFresh(session.verifiedAt);
    return this.registrationOptions(request, user, "add");
  }
  async addKey(request: Request, body: unknown, user: AccessUser, session: Session) {
    requireFresh(session.verifiedAt);
    requireCondition(
      this.passkeys(user.id).length < 10,
      409,
      "passkey_limit",
      "Pro Person sind höchstens zehn Passkeys möglich.",
    );
    const key = await this.verifyRegistration(request, body, "add", user.id);
    this.store.put(`key:${key.id}`, key);
    this.audit(user.id, "passkey_added", user.id);
    return json(this.info(session));
  }
  removeKey(id: string, user: AccessUser, session: Session) {
    requireFresh(session.verifiedAt);
    const key = this.store.get<Passkey>(`key:${id}`);
    requireCondition(key?.userId === user.id, 404, "passkey_missing", "Passkey nicht gefunden.");
    requireCondition(
      this.passkeys(user.id).length > 1,
      409,
      "last_passkey",
      "Füge zuerst einen weiteren Passkey hinzu.",
    );
    this.store.delete(`key:${id}`);
    this.audit(user.id, "passkey_removed", user.id);
    return json(this.info(session));
  }
  access(user: AccessUser) {
    requireAdmin(user);
    return json({
      users: this.users(),
      invitations: this.store
        .list<Invitation>("invite:")
        .filter(([, i]) => !i.bootstrap)
        .map(([, i]) => ({
          id: i.id,
          userId: i.userId,
          name: i.name,
          role: i.role,
          expiresAt: i.expiresAt,
        })),
    });
  }
  private async createInvitation(user: User): Promise<InvitationResult> {
    const token = randomToken();
    const tokenHash = await hash(token);
    const expires = Date.now() + 14 * DAY;
    const invitation: Invitation = {
      id: crypto.randomUUID(),
      userId: user.id,
      name: user.name,
      role: user.role,
      expiresAt: new Date(expires).toISOString(),
      tokenHash,
    };
    this.store.put(`invite:${tokenHash}`, invitation, expires);
    const { tokenHash: _secret, ...info } = invitation;
    return { ...info, url: `${this.env.ADMIN_ORIGIN}/#invite=${token}` };
  }
  async invite(body: unknown, actor: AccessUser, session: Session) {
    requireAdmin(actor);
    requireFresh(session.verifiedAt);
    const input = invitationSchema.parse(body);
    requireCondition(
      this.users().length < 100,
      409,
      "user_limit",
      "Die Verwaltung ist für höchstens 100 Zugänge eingerichtet.",
    );
    const user: User = {
      ...input,
      id: crypto.randomUUID(),
      active: false,
      createdAt: new Date().toISOString(),
    };
    this.store.put(`user:${user.id}`, user);
    const invitation = await this.createInvitation(user);
    this.audit(actor.id, "invitation_created", user.id);
    return json(invitation, 201);
  }
  cancelInvite(id: string, actor: AccessUser, session: Session) {
    requireAdmin(actor);
    requireFresh(session.verifiedAt);
    const invite = this.store
      .list<Invitation>("invite:")
      .find(([, i]) => i.id === id && !i.bootstrap);
    requireCondition(invite, 404, "invite_missing", "Einladung nicht gefunden.");
    this.store.delete(invite[0]);
    this.audit(actor.id, "invitation_revoked", invite[1].userId);
    return json({ ok: true });
  }
  patchAccess(id: string, body: unknown, actor: AccessUser, session: Session) {
    requireAdmin(actor);
    requireFresh(session.verifiedAt);
    const patch = accessPatchSchema.parse(body);
    const user = this.user(id);
    requireCondition(user, 404, "user_missing", "Zugang nicht gefunden.");
    requireCondition(
      patch.active !== true || user.passkeyCount > 0,
      409,
      "no_passkey",
      "Bitte erst einen Einladungslink für diese Person erstellen.",
    );
    preserveLastAdmin(this.users(), user, patch);
    this.store.put(`user:${id}`, { ...user, ...patch });
    if (patch.active === false || (patch.role && patch.role !== user.role)) this.revoke(id);
    this.audit(actor.id, "access_updated", id);
    return json({ ok: true });
  }
  async resetAccess(id: string, actor: AccessUser, session: Session) {
    requireAdmin(actor);
    requireFresh(session.verifiedAt);
    const user = this.user(id);
    requireCondition(user, 404, "user_missing", "Zugang nicht gefunden.");
    preserveLastAdmin(this.users(), user, { active: false });
    this.revoke(id, true);
    this.store.put(`user:${id}`, { ...user, active: false });
    const invitation = await this.createInvitation(user);
    this.audit(actor.id, "access_reset", id);
    return json(invitation, 201);
  }
}
