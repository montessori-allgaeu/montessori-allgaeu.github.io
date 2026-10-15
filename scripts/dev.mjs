import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { dev } from "astro";

const { values } = parseArgs({
  options: {
    port: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help) {
  process.stdout.write(
    "Usage: ./dev [--port PORT]\nDefault: public website on port 8000 with automatic fallback; explicit ports stay fixed.\nAdministration and its local API use the following free ports when configured.\n",
  );
  process.exit(0);
}

const port = values.port === undefined ? 8000 : Number(values.port);
if (!Number.isInteger(port) || port < 0 || port > 65535 || values.port === "") {
  throw new Error("--port must be an integer between 0 and 65535");
}

const root = fileURLToPath(new URL("../", import.meta.url));
const closers = [];
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  await Promise.allSettled(closers.reverse().map((close) => close()));
  process.exit(code);
}
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());

try {
  // The API stays in the foreground and never replaces another task's listener.
  const server = await dev({
    root: new URL("../", import.meta.url),
    force: true,
    server: { port, host: "127.0.0.1" },
    vite: { server: { strictPort: values.port !== undefined } },
  });
  closers.push(() => server.stop());
  process.stdout.write(`Monte-Website: http://127.0.0.1:${server.address.port}/\n`);

  if (
    existsSync(join(root, "admin/vite.config.ts")) &&
    existsSync(join(root, "wrangler.admin.jsonc"))
  ) {
    const { startAdminServers } = await import("./dev-admin.mjs");
    await startAdminServers({
      root,
      startPort: server.address.port + 1,
      registerStop: (close) => closers.push(close),
      onFailure: (error) => {
        console.error(error);
        void stop(1);
      },
    });
  }
} catch (error) {
  console.error(error);
  await stop(1);
}
