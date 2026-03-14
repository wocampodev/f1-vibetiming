import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const port = Number(
  process.env.WEB_SMOKE_PORT ??
    3105 + Math.floor(Math.random() * 200),
);
const baseUrl = `http://127.0.0.1:${port}`;
const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const routes = [
  { path: '/', status: 200, contains: 'Waiting for live board projection.' },
  { path: '/live', status: 200, contains: 'Waiting for live board projection.' },
  { path: '/standings', status: 200, contains: 'Championship standings' },
  { path: '/calendar', status: 404 },
  { path: '/session', status: 404 },
  { path: '/session/unknown-session', status: 404 },
  { path: '/weekend/unknown-event', status: 404 },
];

function startWebServer() {
  const nextBinary = path.join(
    webDir,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'next.cmd' : 'next',
  );

  return spawn(nextBinary, ['dev', '--port', String(port)], {
    cwd: webDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
    },
  });
}

async function waitUntilReachable(timeoutMs = 90_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // Server not ready yet.
    }

    await delay(1000);
  }

  throw new Error(`Web server was not reachable on ${baseUrl} within ${timeoutMs}ms`);
}

async function runSmokeChecks() {
  for (const route of routes) {
    const response = await fetch(`${baseUrl}${route.path}`);
    const expectedStatus = route.status ?? 200;
    if (response.status !== expectedStatus) {
      throw new Error(
        `Smoke check failed for ${route.path}: expected HTTP ${expectedStatus}, got ${response.status}`,
      );
    }

    if (!route.contains) {
      continue;
    }

    const html = await response.text();
    if (!html.includes(route.contains)) {
      throw new Error(
        `Smoke check failed for ${route.path}: expected body to include "${route.contains}"`,
      );
    }
  }
}

async function stopServer(server) {
  if (server.exitCode !== null) {
    return;
  }

  server.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => {
      server.once('exit', resolve);
    }),
    delay(10_000),
  ]);

  if (server.exitCode === null) {
    server.kill('SIGKILL');
  }
}

const server = startWebServer();
let failed = false;

try {
  await waitUntilReachable();
  await runSmokeChecks();
  console.log('Web smoke checks passed.');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  failed = true;
} finally {
  await stopServer(server);
  process.exitCode = failed ? 1 : 0;
}
