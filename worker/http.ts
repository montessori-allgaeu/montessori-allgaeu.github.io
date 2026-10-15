export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function requireCondition(
  value: unknown,
  status: number,
  code: string,
  message: string,
): asserts value {
  if (!value) throw new HttpError(status, code, message);
}

export function json(value: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export async function boundedBody(request: Request, limit: number): Promise<ArrayBuffer> {
  const length = request.headers.get("Content-Length");
  requireCondition(!length || Number(length) <= limit, 413, "too_large", "Die Datei ist zu groß.");
  const reader = request.body?.getReader();
  if (!reader) return new ArrayBuffer(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new HttpError(413, "too_large", "Die Anfrage ist zu groß.");
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output.buffer;
}

export async function readJson(request: Request): Promise<unknown> {
  requireCondition(
    request.headers.get("Content-Type")?.split(";")[0] === "application/json",
    415,
    "content_type",
    "JSON erwartet.",
  );
  const buffer = await boundedBody(request, 512 * 1024);
  try {
    return JSON.parse(new TextDecoder().decode(buffer));
  } catch {
    throw new HttpError(400, "invalid_json", "Die Anfrage konnte nicht gelesen werden.");
  }
}

export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decode64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    c.charCodeAt(0),
  );
}

export function randomToken() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}
export async function hash(value: string | ArrayBuffer) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    typeof value === "string" ? new TextEncoder().encode(value) : value,
  );
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function cookieValue(request: Request, name: string) {
  return request.headers
    .get("Cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export function cookie(name: string, value: string, seconds: number, origin: string) {
  const secure = origin.startsWith("https:") ? "; Secure" : "";
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${secure}`;
}

export function cookieName(origin: string, kind: "session" | "flow") {
  return `${origin.startsWith("https:") ? "__Host-" : ""}monte-${kind}`;
}

export function sameOrigin(request: Request, origin: string) {
  requireCondition(
    request.headers.get("Origin") === origin,
    403,
    "origin",
    "Bitte die Verwaltung in einem eigenen Fenster öffnen.",
  );
}

export function secured(response: Response) {
  const output = new Response(response.body, response);
  output.headers.set("X-Content-Type-Options", "nosniff");
  output.headers.set("X-Frame-Options", "DENY");
  output.headers.set("Referrer-Policy", "no-referrer");
  output.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  output.headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  return output;
}
