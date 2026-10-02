import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const explicitPort = args.length > 0;
const port = explicitPort ? Number(args[1]) : 8000;

if (
  (explicitPort && (args.length !== 2 || args[0] !== "--port" || !/^\d+$/.test(args[1]))) ||
  !Number.isInteger(port) ||
  port < 1 ||
  port > 65535
) {
  console.error("Aufruf: ./dev [--port N], mit einem Port zwischen 1 und 65535.");
  process.exit(1);
}

process.chdir(fileURLToPath(new URL("../", import.meta.url)));
process.env.ASTRO_TELEMETRY_DISABLED = "1";

try {
  const { dev } = await import("astro");
  const server = await dev({
    force: true,
    server: { host: "127.0.0.1", port },
    vite: { server: { strictPort: explicitPort } },
  });

  process.stdout.write(`Lokale Vorschau: http://127.0.0.1:${server.address.port}/\n`);

  const stop = async () => {
    await server.stop();
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
} catch (error) {
  console.error(error);
  process.exit(1);
}
