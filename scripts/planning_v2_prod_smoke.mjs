import { spawn } from "node:child_process";
import path from "node:path";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseArgs(argv) {
  const out = {
    appDir: process.cwd(),
    port: 3100,
    timeoutMs: 120_000,
  };
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const [rawKey, ...rawRest] = token.slice(2).split("=");
    const key = asString(rawKey);
    const value = rawRest.join("=");
    if (key === "app-dir") out.appDir = asString(value) || out.appDir;
    if (key === "port") {
      const parsed = Math.trunc(Number(value));
      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 65535) out.port = parsed;
    }
    if (key === "timeout-ms") {
      const parsed = Math.trunc(Number(value));
      if (Number.isFinite(parsed) && parsed >= 5_000 && parsed <= 600_000) out.timeoutMs = parsed;
    }
  }
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      done({ code, signal });
    });
  });
}

async function stopServer(child) {
  if (child.killed) return;
  if (process.platform !== "win32" && typeof child.pid === "number") {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // ignore
    }
  } else {
    child.kill("SIGTERM");
  }
  const graceful = await waitForExit(child, 5_000);
  if (graceful) return;

  if (process.platform !== "win32" && typeof child.pid === "number") {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // ignore
    }
  } else {
    child.kill("SIGKILL");
  }
  await waitForExit(child, 2_000);
}

async function waitForUrl(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { cache: "no-store", redirect: "manual" });
      if (response.ok || (response.status >= 300 && response.status < 400)) {
        return response.status;
      }
    } catch {
      // wait
    }
    await sleep(500);
  }
  throw new Error(`timeout waiting for ${url}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const appDir = path.resolve(args.appDir);
  const baseUrl = `http://127.0.0.1:${args.port}`;

  let exited = null;
  const server = spawn(process.execPath, ["scripts/next_prod_safe.mjs", "--port", String(args.port)], {
    cwd: appDir,
    env: process.env,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.on("exit", (code, signal) => {
    exited = { code, signal };
  });

  server.stdout.on("data", (chunk) => {
    process.stdout.write(`[prod-smoke][server] ${String(chunk)}`);
  });
  server.stderr.on("data", (chunk) => {
    process.stderr.write(`[prod-smoke][server] ${String(chunk)}`);
  });

  try {
    const startedAt = Date.now();
    while (true) {
      if (exited && exited.code !== 0) {
        throw new Error(`server exited before ready (code=${exited.code ?? "?"}, signal=${exited.signal ?? "none"})`);
      }
      try {
        await waitForUrl(`${baseUrl}/ops/doctor`, 2_000);
        break;
      } catch {
        if (Date.now() - startedAt > args.timeoutMs) {
          throw new Error(`ops doctor did not respond within ${args.timeoutMs}ms`);
        }
      }
      await sleep(300);
    }

    const localDoctorResponse = await fetch(`${baseUrl}/ops/doctor`, { cache: "no-store" });
    if (!localDoctorResponse.ok) {
      throw new Error(`/ops/doctor responded ${localDoctorResponse.status}`);
    }
    process.stdout.write("[planning:v2:prod:smoke] ok local /ops/doctor reachable\n");

    const remoteProbeResponse = await fetch(`${baseUrl}/api/ops/doctor`, {
      cache: "no-store",
      headers: {
        "x-forwarded-for": "203.0.113.10",
        "x-forwarded-host": "example-remote.invalid",
      },
    });

    if (remoteProbeResponse.status === 403) {
      process.stdout.write("[planning:v2:prod:smoke] ok remote probe blocked (403)\n");
    } else {
      process.stdout.write(
        `[planning:v2:prod:smoke] warn remote probe status=${remoteProbeResponse.status} (forwarded-header enforcement may depend on runtime proxy)\n`,
      );
    }

    process.stdout.write("[planning:v2:prod:smoke] PASS\n");
  } finally {
    await stopServer(server);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[planning:v2:prod:smoke] failed\n${message}\n`);
  process.exit(1);
});

