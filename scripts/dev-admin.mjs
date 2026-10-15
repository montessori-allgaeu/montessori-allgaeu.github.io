import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "vite";

/** Probe only loopback; never terminate an existing listener to obtain a port. */
export async function firstFreePort(start) {
  for (let port = start; port <= 65535; port++) {
    const probe = net.createServer();
    const available = await new Promise((resolve, reject) => {
      probe.once("error", (error) => {
        if (error.code === "EADDRINUSE") resolve(false);
        else reject(error);
      });
      probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
    });
    if (available) return port;
  }
  throw new Error("No free local port remains for the administration servers.");
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve) => {
    const force = setTimeout(() => child.kill("SIGKILL"), 5000);
    child.once("exit", () => {
      clearTimeout(force);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

async function waitForBackend(url, child, stopped) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (stopped() || child.exitCode !== null || child.signalCode !== null)
      throw new Error("The local administration API stopped during startup.");
    try {
      const response = await fetch(`${url}/api/session`, { signal: AbortSignal.timeout(1000) });
      await response.body?.cancel();
      if (response.status !== 503) return;
    } catch {
      /* Wrangler has not bound its listener yet. */
    }
    await delay(100);
  }
  throw new Error(`The local administration API did not become reachable at ${url}.`);
}

/** Start only local infrastructure. Production bindings are disabled by --local. */
export async function startAdminServers({ root, startPort, registerStop, onFailure }) {
  const children = new Set();
  let vite;
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await Promise.allSettled([vite?.close(), ...Array.from(children, stopChild)]);
  };
  registerStop(stop);

  const run = (args, options = {}) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      stdio: ["ignore", "inherit", "inherit"],
      ...options,
    });
    children.add(child);
    child.once("exit", () => children.delete(child));
    return child;
  };

  try {
    if (!existsSync(join(root, "dist-admin/index.html"))) {
      process.stdout.write("Preparing the local administration assets once…\n");
      const build = run([
        join(root, "node_modules/vite/bin/vite.js"),
        "build",
        "--config",
        "admin/vite.config.ts",
      ]);
      await new Promise((resolve, reject) => {
        build.once("error", reject);
        build.once("exit", (code) =>
          code === 0 ? resolve() : reject(new Error(`Administration build failed (${code}).`)),
        );
      });
    }
    if (stopping) return;

    const adminPort = await firstFreePort(startPort);
    const apiPort = await firstFreePort(adminPort + 1);
    const adminUrl = `http://localhost:${adminPort}`;
    const apiUrl = `http://127.0.0.1:${apiPort}`;
    const previousTarget = process.env.MONTE_API_TARGET;
    process.env.MONTE_API_TARGET = apiUrl;
    try {
      vite = await createServer({
        configFile: join(root, "admin/vite.config.ts"),
        server: { host: "127.0.0.1", port: adminPort, strictPort: true, proxy: { "/api": apiUrl } },
      });
    } finally {
      if (previousTarget === undefined) delete process.env.MONTE_API_TARGET;
      else process.env.MONTE_API_TARGET = previousTarget;
    }
    await vite.listen();
    process.stdout.write(`Monte-Verwaltung: ${adminUrl}/\n`);

    const backend = run([
      join(root, "node_modules/wrangler/bin/wrangler.js"),
      "dev",
      "--config",
      "wrangler.admin.jsonc",
      "--local",
      "--ip",
      "127.0.0.1",
      "--port",
      String(apiPort),
      "--inspector-port",
      "0",
      "--local-upstream",
      `localhost:${adminPort}`,
      "--upstream-protocol",
      "http",
      "--persist-to",
      join(root, ".wrangler/state"),
      "--var",
      `ADMIN_ORIGIN:${adminUrl}`,
      "--var",
      "RP_ID:localhost",
      "--show-interactive-dev-session=false",
    ]);
    backend.once("error", (error) => {
      if (!stopping) onFailure(error);
    });
    backend.once("exit", (code) => {
      if (!stopping) onFailure(new Error(`Local administration API exited (${code}).`));
    });
    await waitForBackend(apiUrl, backend, () => stopping);
    process.stdout.write(`Monte-Verwaltung API: ${apiUrl}/\n`);
    return { adminUrl, apiUrl, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
