import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type { ApiError, SessionInfo } from "../../src/admin/types";

type AuthenticationOptions = Parameters<typeof startAuthentication>[0]["optionsJSON"];
type RegistrationOptions = Parameters<typeof startRegistration>[0]["optionsJSON"];

export class RequestError extends Error {
  constructor(
    public status: number,
    public detail: ApiError,
  ) {
    super(detail.error);
    this.name = "RequestError";
  }
}

export class AdminApi {
  session: SessionInfo | null = null;
  onSession: (session: SessionInfo | null) => void = () => {};

  setSession(session: SessionInfo | null) {
    this.session = session;
    this.onSession(session);
  }

  async request<T>(path: string, options: RequestInit = {}, reauthenticate = true): Promise<T> {
    const headers = new Headers(options.headers);
    if (options.body && !(options.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
    if (options.method && options.method !== "GET" && this.session) {
      headers.set("X-CSRF-Token", this.session.csrfToken);
    }
    let response: Response;
    try {
      response = await fetch(`/api${path}`, { ...options, headers, credentials: "same-origin" });
    } catch {
      throw new Error(
        "Die Verbindung ist unterbrochen. Deine Eingaben bleiben hier erhalten. Bitte versuche es erneut.",
      );
    }
    let result: unknown;
    try {
      result = response.status === 204 ? undefined : await response.json();
    } catch {
      throw new Error(
        "Die Verwaltung ist gerade nicht erreichbar. Deine Eingaben bleiben hier erhalten. Bitte versuche es später erneut.",
      );
    }
    if (response.status === 428 && reauthenticate) {
      await this.signIn();
      return this.request<T>(path, options, false);
    }
    if (!response.ok) {
      const detail =
        result && typeof result === "object" && "error" in result
          ? (result as ApiError)
          : {
              error:
                response.status === 429
                  ? "Die kostenlose Kapazität ist gerade ausgeschöpft. Bitte versuche es später erneut. Die Website bleibt erreichbar."
                  : "Die Anfrage konnte nicht verarbeitet werden.",
              code: "request_failed",
            };
      if (response.status === 401 && !path.startsWith("/auth") && !path.startsWith("/enroll"))
        this.setSession(null);
      throw new RequestError(response.status, detail);
    }
    return result as T;
  }

  post<T>(path: string, data: unknown = {}, reauthenticate = true) {
    return this.request<T>(path, { method: "POST", body: JSON.stringify(data) }, reauthenticate);
  }

  async signIn() {
    const challenge = await this.post<{ challengeId: string; options: AuthenticationOptions }>(
      "/auth/options",
      {},
      false,
    );
    const response = await startAuthentication({ optionsJSON: challenge.options });
    const session = await this.post<SessionInfo>(
      "/auth/verify",
      { challengeId: challenge.challengeId, response },
      false,
    );
    this.setSession(session);
    return session;
  }

  async enroll(token: string, label: string) {
    const challenge = await this.post<{
      challengeId: string;
      options: RegistrationOptions;
      name: string;
    }>("/enroll/options", { token }, false);
    const response = await startRegistration({ optionsJSON: challenge.options });
    const session = await this.post<SessionInfo>(
      "/enroll/verify",
      { token, challengeId: challenge.challengeId, response, label },
      false,
    );
    this.setSession(session);
    return session;
  }

  async addPasskey(label: string) {
    const challenge = await this.post<{ challengeId: string; options: RegistrationOptions }>(
      "/passkeys/options",
    );
    const response = await startRegistration({ optionsJSON: challenge.options });
    await this.post("/passkeys/verify", { challengeId: challenge.challengeId, response, label });
    const session = await this.request<SessionInfo>("/me");
    this.setSession(session);
  }
}

export function errorText(error: unknown) {
  if (error instanceof Error && (error.name === "NotAllowedError" || error.name === "AbortError")) {
    return "Die Passkey-Bestätigung wurde abgebrochen oder ist abgelaufen. Du kannst es erneut versuchen.";
  }
  return error instanceof Error
    ? error.message
    : "Das hat nicht geklappt. Bitte versuche es erneut.";
}

export const api = new AdminApi();
