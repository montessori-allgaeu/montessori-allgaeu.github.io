import { isoCBOR } from "@simplewebauthn/server/helpers";
import { base64url, decode64 } from "./http";

// A test authenticator signs real WebAuthn challenges; production verification is never bypassed.
export async function testPasskey() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const id = crypto.getRandomValues(new Uint8Array(32));
  const cose = isoCBOR.encode(
    new Map<number, number | Uint8Array>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, decode64(jwk.x!)],
      [-3, decode64(jwk.y!)],
    ]),
  );
  const rp = "verwaltung.example.test";
  const origin = `https://${rp}`;
  async function authenticatorData(flags: number, counter: number) {
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rp)),
    );
    const result = new Uint8Array(37);
    result.set(digest);
    result[32] = flags;
    new DataView(result.buffer).setUint32(33, counter);
    return result;
  }
  return {
    id: base64url(id),
    async register(challenge: string, verified = true) {
      const auth = await authenticatorData(verified ? 0x45 : 0x41, 0);
      const data = new Uint8Array(auth.length + 18 + id.length + cose.length);
      data.set(auth);
      new DataView(data.buffer).setUint16(53, id.length);
      data.set(id, 55);
      data.set(cose, 55 + id.length);
      const client = new TextEncoder().encode(
        JSON.stringify({ type: "webauthn.create", challenge, origin, crossOrigin: false }),
      );
      return {
        id: base64url(id),
        rawId: base64url(id),
        type: "public-key",
        clientExtensionResults: { credProps: { rk: true } },
        response: {
          clientDataJSON: base64url(client),
          attestationObject: base64url(
            isoCBOR.encode(
              new Map<string, string | Uint8Array | Map<string, never>>([
                ["fmt", "none"],
                ["attStmt", new Map<string, never>()],
                ["authData", data],
              ]),
            ),
          ),
          transports: ["internal"],
        },
      };
    },
    async authenticate(challenge: string, userId: string, counter = 1) {
      const auth = await authenticatorData(5, counter);
      const client = new TextEncoder().encode(
        JSON.stringify({ type: "webauthn.get", challenge, origin, crossOrigin: false }),
      );
      const clientHash = new Uint8Array(await crypto.subtle.digest("SHA-256", client));
      const signed = new Uint8Array(auth.length + clientHash.length);
      signed.set(auth);
      signed.set(clientHash, auth.length);
      const raw = new Uint8Array(
        await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, signed),
      );
      const integer = (value: Uint8Array) => {
        let start = 0;
        while (start < value.length - 1 && value[start] === 0) start++;
        const trimmed = value.slice(start);
        return trimmed[0] & 128 ? new Uint8Array([0, ...trimmed]) : trimmed;
      };
      const r = integer(raw.slice(0, 32));
      const s = integer(raw.slice(32));
      const der = new Uint8Array([
        48,
        4 + r.length + s.length,
        2,
        r.length,
        ...r,
        2,
        s.length,
        ...s,
      ]);
      return {
        id: base64url(id),
        rawId: base64url(id),
        type: "public-key",
        clientExtensionResults: {},
        response: {
          clientDataJSON: base64url(client),
          authenticatorData: base64url(auth),
          signature: base64url(der),
          userHandle: base64url(new TextEncoder().encode(userId)),
        },
      };
    },
  };
}
