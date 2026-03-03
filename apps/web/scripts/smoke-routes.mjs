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
  { path: '/', contains: 'F1 VibeTiming weekend tracker' },
  { path: '/calendar', contains: 'Calendar' },
  { path: '/standings', contains: 'Standings' },
  { path: '/weekend/unknown-event', contains: 'Weekend not found' },
  { path: '/session/unknown-session', contains: 'Session unavailable' },
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
    if (!response.ok) {
      throw new Error(
        `Smoke check failed for ${route.path}: expected HTTP 200, got ${response.status}`,
      );
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
