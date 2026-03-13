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

function findNextStaticAssetPath(html) {
  const match = html.match(/(?:src|href)=["'](\/_next\/static\/[^"'<>]+)["']/i);
  return match ? match[1] : "";
}

function assertContains(text, expected, label) {
  if (!text.includes(expected)) {
    throw new Error(`${label} missing "${expected}"`);
  }
}

function assertNotContains(text, expected, label) {
  if (text.includes(expected)) {
    throw new Error(`${label} should stay hidden in production: "${expected}"`);
  }
}

function pickResolvedPort(text) {
  const match = text.match(/Bind:\s*host=[^\s]+\s+port=(\d+)/i);
  if (!match) return null;
  const parsed = Math.trunc(Number(match[1]));
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : null;
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

async function fetchOk(url, label) {
  const response = await fetch(url, { cache: "no-store", redirect: "manual" });
  if (!response.ok) {
    throw new Error(`${label} responded ${response.status}`);
  }
  return response;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const appDir = path.resolve(args.appDir);
  let runtimePort = null;
  const baseUrl = () => {
    if (runtimePort === null) {
      throw new Error("runtime port is not resolved yet");
    }
    return `http://127.0.0.1:${runtimePort}`;
  };
  const readinessPath = "/public/dart";

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
    const text = String(chunk);
    const resolvedPort = pickResolvedPort(text);
    if (resolvedPort !== null) {
      runtimePort = resolvedPort;
    }
    process.stdout.write(`[prod-smoke][server] ${text}`);
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
      if (runtimePort === null) {
        if (Date.now() - startedAt > args.timeoutMs) {
          throw new Error(`server did not report a bind port within ${args.timeoutMs}ms`);
        }
        await sleep(300);
        continue;
      }
      try {
        await waitForUrl(`${baseUrl()}${readinessPath}`, 2_000);
        break;
      } catch {
        if (Date.now() - startedAt > args.timeoutMs) {
          throw new Error(`${readinessPath} did not respond within ${args.timeoutMs}ms`);
        }
      }
      await sleep(300);
    }

    const dartPageResponse = await fetchOk(`${baseUrl()}${readinessPath}`, readinessPath);
    process.stdout.write(`[planning:v2:prod:smoke] ok local ${readinessPath} reachable\n`);
    const dartHtml = await dartPageResponse.text();
    const nextStaticAssetPath = findNextStaticAssetPath(dartHtml);
    if (!nextStaticAssetPath) {
      throw new Error("could not find a /_next/static asset on /public/dart");
    }
    await fetchOk(`${baseUrl()}${nextStaticAssetPath}`, `standalone asset ${nextStaticAssetPath}`);
    process.stdout.write(`[planning:v2:prod:smoke] ok standalone asset reachable ${nextStaticAssetPath}\n`);

    await fetchOk(`${baseUrl()}/next.svg`, "/next.svg");
    process.stdout.write("[planning:v2:prod:smoke] ok public asset reachable\n");

    const dataSourcesResponse = await fetchOk(`${baseUrl()}/settings/data-sources`, "/settings/data-sources");
    const dataSourcesHtml = await dataSourcesResponse.text();
    const requiredDataSourcesTexts = [
      "데이터 소스 연동 상태",
      "운영 최신 기준",
      "data-source-impact-health-dart",
      "data-source-impact-health-planning",
      "기업 공시 모니터링",
      "재무설계 기준금리 참고",
    ];
    for (const expectedText of requiredDataSourcesTexts) {
      assertContains(dataSourcesHtml, expectedText, "/settings/data-sources");
    }
    assertNotContains(dataSourcesHtml, "Fallback/쿨다운 진단", "/settings/data-sources");
    assertNotContains(dataSourcesHtml, "최근 오류", "/settings/data-sources");
    assertNotContains(dataSourcesHtml, "data-source-impact-meta-dart", "/settings/data-sources");
    assertNotContains(dataSourcesHtml, "data-source-impact-ping-", "/settings/data-sources");
    process.stdout.write("[planning:v2:prod:smoke] ok /settings/data-sources read-only render\n");

    const remoteProbeResponse = await fetch(`${baseUrl()}/api/ops/doctor`, {
      cache: "no-store",
      headers: {
        "x-forwarded-for": "203.0.113.10",
        "x-forwarded-host": "example-remote.invalid",
      },
    });

    if (remoteProbeResponse.status === 403 || remoteProbeResponse.status === 404) {
      process.stdout.write(`[planning:v2:prod:smoke] ok remote probe blocked (${remoteProbeResponse.status})\n`);
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
