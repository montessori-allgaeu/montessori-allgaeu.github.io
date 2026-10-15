import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

const repo = fileURLToPath(new URL("../", import.meta.url));

async function fixture(t, defaultPort, includeAdmin = false) {
  const root = await mkdtemp(path.join(os.tmpdir(), "astro dev test "));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "scripts"));
  await mkdir(path.join(root, "src/pages"), { recursive: true });
  await symlink(path.join(repo, "node_modules"), path.join(root, "node_modules"));
  await writeFile(path.join(root, "package.json"), '{"type":"module"}');
  await writeFile(path.join(root, "src/pages/index.astro"), "<h1>Local dev fixture</h1>");
  const original = await readFile(path.join(repo, "scripts/dev.mjs"), "utf8");
  // Exercise default-port collisions on an isolated, test-owned port.
  assert.ok(original.includes("? 8000 :"));
  await writeFile(
    path.join(root, "scripts/dev.mjs"),
    original.replace("? 8000 :", `? ${defaultPort} :`),
  );
  if (includeAdmin) {
    await writeFile(
      path.join(root, "scripts/dev-admin.mjs"),
      await readFile(path.join(repo, "scripts/dev-admin.mjs"), "utf8"),
    );
    await mkdir(path.join(root, "admin"));
    await writeFile(path.join(root, "admin/index.html"), "<h1>Local admin fixture</h1>");
    await writeFile(
      path.join(root, "admin/vite.config.ts"),
      `import { defineConfig } from "vite"; import { fileURLToPath } from "node:url";
      export default defineConfig({ root: fileURLToPath(new URL(".", import.meta.url)), build: { outDir: "../dist-admin", emptyOutDir: true } });`,
    );
    await writeFile(
      path.join(root, "worker.mjs"),
      `export default { fetch(request, env) { return Response.json({ origin: env.ADMIN_ORIGIN, rpId: env.RP_ID, path: new URL(request.url).pathname, requestOrigin: new URL(request.url).origin }); } };`,
    );
    await writeFile(
      path.join(root, "wrangler.admin.jsonc"),
      JSON.stringify({
        name: "monte-local-dev-test",
        main: "worker.mjs",
        compatibility_date: "2026-10-15",
        assets: { directory: "dist-admin", run_worker_first: ["/api/*"] },
        vars: { ADMIN_ORIGIN: "https://production.invalid", RP_ID: "production.invalid" },
      }),
    );
  }
  return root;
}

async function blocker(t) {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return server;
}

async function consecutivePort(t) {
  // Stay outside the OS ephemeral range: Astro's own startup connections use it.
  for (let port = 18000; port < 18100; port++) {
    const servers = [net.createServer(), net.createServer()];
    const close = (server) => new Promise((resolve) => server.close(resolve));
    try {
      for (const [offset, server] of servers.entries()) {
        server.listen(port + offset, "127.0.0.1");
        await once(server, "listening");
      }
    } catch (error) {
      await Promise.all(servers.filter((server) => server.listening).map(close));
      if (error.code === "EADDRINUSE") continue;
      throw error;
    }
    t.after(() => close(servers[0]));
    await close(servers[1]);
    return servers[0];
  }
  throw new Error("No consecutive test ports available");
}

function start(t, root, args = []) {
  const child = spawn(process.execPath, [path.join(root, "scripts/dev.mjs"), ...args], {
    cwd: path.join(root, "src"),
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", CODEX_CI: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });
  const exited = once(child, "exit");
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await exited;
  });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No startup URL: ${output}`)), 30000);
    child.stdout.on("data", () => {
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\//);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Exited ${code}: ${output}`));
    });
  });
  // Explicit-port failure tests await exit instead of readiness.
  ready.catch(() => {});
  return { child, exited, ready, output: () => output };
}

test(
  "agent startup stays in foreground, preserves the occupied port, and closes on SIGINT",
  { timeout: 45000 },
  async (t) => {
    const held = await consecutivePort(t);
    const port = held.address().port;
    const root = await fixture(t, port);
    const running = start(t, root);
    const url = await running.ready;
    assert.equal(Number(new URL(url).port), port + 1);
    assert.equal(running.child.exitCode, null);
    assert.match(await (await fetch(url)).text(), /Local dev fixture/);
    assert.equal(held.listening, true);
    running.child.kill("SIGINT");
    assert.deepEqual(await running.exited, [0, null]);
    const replacement = net.createServer();
    replacement.listen(Number(new URL(url).port), "127.0.0.1");
    await once(replacement, "listening");
    await new Promise((resolve) => replacement.close(resolve));
  },
);

test(
  "an explicitly occupied port fails without a success URL or replacing its owner",
  { timeout: 45000 },
  async (t) => {
    const held = await blocker(t);
    const port = held.address().port;
    const root = await fixture(t, port);
    const running = start(t, root, ["--port", String(port)]);
    const [code] = await running.exited;
    assert.notEqual(code, 0);
    assert.doesNotMatch(running.output(), /Local\s+http:\/\//);
    assert.match(running.output(), /already in use/);
    assert.equal(held.listening, true);
  },
);

test(
  "one entry starts the local administration and API with aligned origins and stops every listener",
  { timeout: 90000 },
  async (t) => {
    const held = await consecutivePort(t);
    const root = await fixture(t, held.address().port, true);
    const running = start(t, root);
    const publicUrl = await running.ready;
    let adminUrl;
    let apiUrl;
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      adminUrl = running.output().match(/Monte-Verwaltung: (http:\/\/localhost:\d+)\//)?.[1];
      apiUrl = running.output().match(/Monte-Verwaltung API: (http:\/\/127\.0\.0\.1:\d+)\//)?.[1];
      if (adminUrl && apiUrl) break;
      assert.equal(running.child.exitCode, null, running.output());
      await delay(100);
    }
    assert.ok(adminUrl && apiUrl, running.output());
    assert.equal(Number(new URL(adminUrl).port), Number(new URL(publicUrl).port) + 1);
    assert.equal(Number(new URL(apiUrl).port), Number(new URL(adminUrl).port) + 1);
    assert.match(await (await fetch(publicUrl)).text(), /Local dev fixture/);
    assert.match(await (await fetch(adminUrl)).text(), /Local admin fixture/);
    assert.deepEqual(await (await fetch(`${adminUrl}/api/session`)).json(), {
      origin: adminUrl,
      rpId: "localhost",
      path: "/api/session",
      requestOrigin: adminUrl,
    });
    assert.match(running.output(), /Preparing the local administration assets once/);
    assert.equal(held.listening, true);
    running.child.kill("SIGINT");
    assert.deepEqual(await running.exited, [0, null]);
    for (const url of [publicUrl, adminUrl, apiUrl]) {
      const replacement = net.createServer();
      replacement.listen(Number(new URL(url).port), "127.0.0.1");
      await once(replacement, "listening");
      await new Promise((resolve) => replacement.close(resolve));
    }
  },
);
