import { brotliCompressSync, gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { once } from "node:events";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { afterAll, beforeAll, expect, test } from "vitest";
import { unstable_readConfig } from "wrangler";

const payload = Buffer.from('{"ok":true}');
const brotli = brotliCompressSync(payload);
const gzip = gzipSync(payload);
let runtime: Miniflare;
const upstream = createServer((request, response) => {
  const encoding = request.url?.slice(1);
  if (encoding !== "plain") response.setHeader("Content-Encoding", encoding ?? "identity");
  response.end(encoding === "br" ? brotli : encoding === "gzip" ? gzip : payload);
});

beforeAll(async () => {
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const address = upstream.address();
  if (!address || typeof address === "string") throw new Error("Expected a local TCP listener");
  const origin = `http://127.0.0.1:${address.port}`;
  const config = unstable_readConfig({
    config: fileURLToPath(new URL("../wrangler.admin.jsonc", import.meta.url)),
  });
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: config.compatibility_date,
      compatibilityFlags: config.compatibility_flags,
      cf: false,
      script: `export default {
        async fetch(request) {
          if (new URL(request.url).pathname === "/incoming")
            return new Response(await request.arrayBuffer());
          const response = await fetch(${JSON.stringify(origin)} + new URL(request.url).pathname);
          return new Response(await response.arrayBuffer());
        }
      };`,
    }),
  );
  await runtime.ready;
});

afterAll(async () => {
  await runtime?.dispose();
  await new Promise<void>((resolve, reject) =>
    upstream.close((error) => (error ? reject(error) : resolve())),
  );
});

test("the administration runtime leaves Brotli responses encoded before any body read", async () => {
  // Use ordinary, locally compressed data; never a vulnerability payload.
  const response = await runtime.dispatchFetch("https://worker.test/br");
  expect(Buffer.from(await response.arrayBuffer())).toEqual(brotli);
});

test.each(["gzip", "plain"])(
  "the administration runtime still reads %s responses",
  async (encoding) => {
    const response = await runtime.dispatchFetch(`https://worker.test/${encoding}`);
    expect(await response.json()).toEqual({ ok: true });
  },
);

test("incoming Brotli bodies reach the handler without automatic decompression", async () => {
  const response = await runtime.dispatchFetch("https://worker.test/incoming", {
    method: "POST",
    headers: { "Content-Encoding": "br" },
    body: brotli,
  });
  expect(Buffer.from(await response.arrayBuffer())).toEqual(brotli);
});
