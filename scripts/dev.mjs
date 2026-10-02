import { parseArgs } from "node:util";
import { dev } from "astro";

const { values } = parseArgs({
  options: {
    port: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help) {
  process.stdout.write(
    "Usage: ./dev [--port PORT]\nDefault: port 8000 with automatic fallback; explicit ports stay fixed.\n",
  );
  process.exit(0);
}

const port = values.port === undefined ? 8000 : Number(values.port);
if (!Number.isInteger(port) || port < 0 || port > 65535 || values.port === "") {
  throw new Error("--port must be an integer between 0 and 65535");
}

// Use Astro's server API: the CLI backgrounds agent runs and --force replaces servers.
const server = await dev({
  root: new URL("../", import.meta.url),
  force: true,
  server: { port, host: "127.0.0.1" },
  vite: { server: { strictPort: values.port !== undefined } },
});

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await server.stop();
  process.exit(0);
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
