import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { logPruneSummary, pruneRootTransientNextArtifacts } from "./next_artifact_prune.mjs";
import { sanitizeInheritedColorEnv } from "./runtime_color_env.mjs";

function parsePort(value, fallback = 3100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const intPort = Math.trunc(parsed);
  if (intPort < 1 || intPort > 65535) return fallback;
  return intPort;
}

function detectRuntime() {
  const rel = (os.release?.() || "").toLowerCase();
  const isWSL = Boolean(process.env.WSL_INTEROP) || Boolean(process.env.WSL_DISTRO_NAME) || rel.includes("microsoft");

  let isDocker = false;
  try {
    if (fs.existsSync("/.dockerenv")) {
      isDocker = true;
    } else {
      const cgroup = fs.readFileSync("/proc/1/cgroup", "utf8");
      if (/docker|containerd|kubepods/i.test(cgroup)) isDocker = true;
    }
  } catch {
    // ignore
  }

  const isDevContainer = Boolean(process.env.REMOTE_CONTAINERS)
    || Boolean(process.env.CODESPACES)
    || Boolean(process.env.DEVCONTAINER)
    || Boolean(process.env.VSCODE_REMOTE_CONTAINERS_SESSION);

  return { isWSL, isDocker, isDevContainer };
}

function hostCandidatesWithOverride(overrideHost, runtime) {
  const cliHost = (overrideHost ?? "").trim();
  if (cliHost) return [cliHost];
  const envHost = (process.env.DEV_HOST ?? "").trim();
  if (envHost) return [envHost];
  if (runtime.isWSL) return ["0.0.0.0", "127.0.0.1"];
  if (runtime.isDocker || runtime.isDevContainer) return ["0.0.0.0", "127.0.0.1"];
  if (process.platform === "win32") return ["127.0.0.1", "0.0.0.0"];
  return ["127.0.0.1", "0.0.0.0"];
}

function parseCliArgs(argv) {
  let overrideHost;
  let overridePort;
  let strictPort = false;
  const passthroughArgs = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--host" || arg === "--hostname" || arg === "-H") {
      if (i + 1 < argv.length) {
        overrideHost = argv[i + 1];
        i += 1;
      }
      continue;
    }
    if (arg === "--port" || arg === "-p") {
      if (i + 1 < argv.length) {
        overridePort = argv[i + 1];
        i += 1;
      }
      continue;
    }
    if (arg === "--strict-port") {
      strictPort = true;
      continue;
    }

    passthroughArgs.push(arg);
  }

  return { overrideHost, overridePort, strictPort, passthroughArgs };
}

function listLanIpv4Addresses(limit = 2) {
  try {
    const netifs = os.networkInterfaces();
    const out = [];
    for (const addresses of Object.values(netifs)) {
      for (const addr of addresses ?? []) {
        if (!addr || addr.family !== "IPv4" || addr.internal) continue;
        out.push(addr.address);
        if (out.length >= limit) return out;
      }
    }
    return out;
  } catch {
    return [];
  }
}

function canListen({ host, port, timeoutMs = 1200 }) {
  return new Promise((resolve) => {
    const server = net.createServer();
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      try {
        server.close();
      } catch {
        // ignore
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      done({ ok: false, error: new Error(`listen timeout ${host}:${port}`) });
    }, timeoutMs);

    server.once("error", (error) => {
      clearTimeout(timer);
      done({ ok: false, error });
    });
    server.listen({ host, port }, () => {
      clearTimeout(timer);
      done({ ok: true });
    });
  });
}

function resolveWindowsPath(posixPath) {
  const converted = spawnSync("wslpath", ["-w", posixPath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (converted.status !== 0) return null;
  const value = (converted.stdout || "").trim();
  return value || null;
}

export function parseBridgeAddressList(value) {
  if (!value || value === "-") return [];
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

export function parseWindowsBridgeStatusLine(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("STATUS ")) return null;

  const match = /^STATUS\s+(READY|FAIL)\s+started=([^\s]+)\s+warnings=([^\s]+)$/.exec(trimmed);
  if (!match) return null;

  return {
    status: match[1],
    listeners: parseBridgeAddressList(match[2]),
    warnings: parseBridgeAddressList(match[3]),
  };
}

export function formatWindowsBridgeFailureReason(status) {
  const warnings = status.warnings.length > 0 ? status.warnings.join(", ") : "unknown";
  return `listen failed (${warnings})`;
}

function launchWindowsLocalhostBridge({ port, targetHost, targetPort }) {
  const scriptPath = fileURLToPath(new URL("./windows_localhost_bridge.ps1", import.meta.url));
  const windowsScriptPath = resolveWindowsPath(scriptPath);
  if (!windowsScriptPath) {
    return { child: null, ready: Promise.resolve({ ok: false, reason: "wslpath failed" }) };
  }

  const child = spawn("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    windowsScriptPath,
    "-ListenPort",
    String(port),
    "-TargetHost",
    targetHost,
    "-TargetPort",
    String(targetPort),
    "-ListenAddressesCsv",
    "127.0.0.1",
  ], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const ready = new Promise((resolve) => {
    let settled = false;
    let stderrBuffer = "";
    let stdoutBuffer = "";
    let stdoutRemainder = "";
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const flushStdoutLines = (flush = false) => {
      const lines = stdoutRemainder.split(/\r?\n/);
      stdoutRemainder = flush ? "" : (lines.pop() ?? "");

      for (const line of lines) {
        const parsed = parseWindowsBridgeStatusLine(line);
        if (parsed) {
          if (parsed.status === "READY") {
            finish({ ok: true, listeners: parsed.listeners, warnings: parsed.warnings });
          } else {
            finish({
              ok: false,
              reason: formatWindowsBridgeFailureReason(parsed),
              listeners: parsed.listeners,
              warnings: parsed.warnings,
            });
          }
          continue;
        }

        if (line.length > 0) {
          process.stdout.write(`${line}\n`);
        }
      }
    };
    const timer = setTimeout(() => {
      finish({ ok: false, reason: "startup timeout" });
    }, 4000);

    child.stdout?.on("data", (chunk) => {
      const text = String(chunk);
      stdoutBuffer += text;
      stdoutRemainder += text;
      flushStdoutLines();
    });
    child.stderr?.on("data", (chunk) => {
      const text = String(chunk);
      stderrBuffer += text;
      if (settled) {
        process.stderr.write(text);
      }
    });
    child.once("exit", (code) => {
      flushStdoutLines(true);
      finish({
        ok: false,
        reason: stderrBuffer.trim() || stdoutBuffer.trim() || `bridge exited (${code ?? "unknown"})`,
      });
    });
    child.once("error", (error) => {
      finish({ ok: false, reason: error.message });
    });
  });

  return { child, ready };
}

function parentDirs(startDir, limit = 8) {
  const dirs = [];
  let current = path.resolve(startDir);
  for (let i = 0; i < limit; i += 1) {
    dirs.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return dirs;
}

function detectWorkspaceRoot(startDir) {
  for (const dir of parentDirs(startDir, 8)) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const pkgPath = path.join(dir, "package.json");
    if (!fs.existsSync(pkgPath)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      if (parsed && typeof parsed === "object" && "workspaces" in parsed) return dir;
    } catch {
      // ignore
    }
  }
  return null;
}

function resolveNextBin(startDir) {
  const require = createRequire(import.meta.url);
  const candidateModules = ["next/dist/bin/next", "next/dist/bin/next.js"];
  const searchDirs = parentDirs(startDir, 8);

  for (const dir of searchDirs) {
    for (const candidate of candidateModules) {
      try {
        return require.resolve(candidate, { paths: [dir] });
      } catch {
        // try next candidate
      }
    }
  }

  const fallback = path.join(startDir, "node_modules", "next", "dist", "bin", "next");
  if (fs.existsSync(fallback)) return fallback;
  return null;
}

async function pickHostPort({ overrideHost, overridePort, runtime, strictPort = false }) {
  const startPort = parsePort(overridePort ?? process.env.PORT, 3100);
  const maxOffset = strictPort ? 0 : 20;
  const hosts = hostCandidatesWithOverride(overrideHost, runtime);
  let lastError = null;

  for (const host of hosts) {
    for (let offset = 0; offset <= maxOffset; offset += 1) {
      const port = startPort + offset;
      const listened = await canListen({ host, port });
      if (listened.ok) return { host, port };
      if (listened.error && typeof listened.error === "object" && "code" in listened.error && listened.error.code === "EPERM") {
        console.warn(`[next_dev_safe] port probe denied for ${host}:${port}; trying actual next bind`);
        return { host, port };
      }
      lastError = listened.error;
    }
  }
  throw lastError ?? new Error("no available host/port candidate");
}

async function main() {
  const runtime = detectRuntime();
  const { overrideHost, overridePort, strictPort, passthroughArgs } = parseCliArgs(process.argv.slice(2));
  const nextBin = resolveNextBin(process.cwd());
  if (!nextBin) {
    const workspaceRoot = detectWorkspaceRoot(process.cwd());
    console.error("[next_dev_safe] Next.js 실행 파일을 찾지 못했습니다.");
    console.error('- 해결: "pnpm install"');
    console.error('- 오프라인: "pnpm deps:offline:install"');
    if (workspaceRoot && workspaceRoot !== process.cwd()) {
      const rel = path.relative(workspaceRoot, process.cwd()) || ".";
      console.error(`- 워크스페이스 실행 예시: "pnpm -C ${workspaceRoot} --filter ${rel} dev"`);
    }
    process.exit(2);
  }
  const { host, port } = await pickHostPort({ overrideHost, overridePort, runtime, strictPort });

  logPruneSummary(
    "[next_dev_safe] root prune",
    pruneRootTransientNextArtifacts({
      cwd: process.cwd(),
      preserveNames: [process.env.PLAYWRIGHT_DIST_DIR ?? "", `.next-host-${port}`],
      ignorePids: [process.pid],
    }),
  );

  console.log(`Bind: host=${host} port=${port}`);
  if (host === "127.0.0.1" && (runtime.isWSL || runtime.isDocker || runtime.isDevContainer)) {
    console.warn("WARNING: 현재 런타임(WSL/컨테이너)에서는 브라우저가 다른 OS/네임스페이스면 localhost가 연결 거부될 수 있습니다.");
    console.warn("WARNING: pnpm dev:lan 또는 --host 0.0.0.0 사용 후 Open (LAN) URL로 접속하세요.");
  }
  console.log(`Open (same env): http://127.0.0.1:${port}`);
  console.log(`Open (same env): http://localhost:${port}`);
  let windowsLocalhostBridge = null;
  if (runtime.isWSL && host === "0.0.0.0") {
    const windowsTargetHost = listLanIpv4Addresses(1)[0];
    if (windowsTargetHost) {
      const launched = launchWindowsLocalhostBridge({
        port,
        targetHost: windowsTargetHost,
        targetPort: port,
      });
      windowsLocalhostBridge = launched.child;
      const ready = await launched.ready;
      if (ready.ok) {
        console.log(`[next_dev_safe] Windows localhost bridge를 추가했습니다. localhost -> ${windowsTargetHost}:${port}`);
        if (ready.warnings?.length) {
          console.warn(`[next_dev_safe] Windows localhost bridge 일부 listen 주소는 건너뛰었습니다: ${ready.warnings.join(", ")}`);
        }
      } else {
        console.warn(`[next_dev_safe] Windows localhost bridge disabled: ${ready.reason}`);
      }
    } else {
      console.warn("[next_dev_safe] Windows localhost bridge disabled: WSL IPv4 주소를 찾지 못했습니다.");
    }
  } else if (host === "::") {
    console.log(`Open (same env): http://[::1]:${port}`);
  }
  if (host === "0.0.0.0" || host === "::") {
    for (const ip of listLanIpv4Addresses(2)) {
      console.log(`Open (LAN): http://${ip}:${port}`);
    }
  }

  console.log(`[next_dev_safe] next bin: ${nextBin}`);
  const env = sanitizeInheritedColorEnv(process.env);
  delete env.HOSTNAME;
  delete env.PORT;

  const child = spawn(process.execPath, [nextBin, "dev", "-H", host, "-p", String(port), ...passthroughArgs], {
    stdio: "inherit",
    env,
  });

  const cleanupHelpers = () => {
    try {
      windowsLocalhostBridge?.kill();
    } catch {
      // ignore cleanup failures
    }
  };

  child.on("exit", (code, signal) => {
    cleanupHelpers();
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });

  process.once("SIGINT", () => {
    cleanupHelpers();
    try {
      child.kill("SIGINT");
    } catch {
      process.exit(130);
    }
  });
  process.once("SIGTERM", () => {
    cleanupHelpers();
    try {
      child.kill("SIGTERM");
    } catch {
      process.exit(143);
    }
  });
}

const isDirectRun = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === fileURLToPath(import.meta.url);
})();

if (isDirectRun) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[next_dev_safe] failed to select host/port:", message);
    process.exit(1);
  });
}
