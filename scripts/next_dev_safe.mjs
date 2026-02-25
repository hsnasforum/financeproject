import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

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
  if (runtime.isWSL || runtime.isDocker || runtime.isDevContainer) return ["0.0.0.0", "127.0.0.1"];
  if (process.platform === "win32") return ["127.0.0.1", "0.0.0.0"];
  return ["127.0.0.1", "0.0.0.0"];
}

function parseCliArgs(argv) {
  let overrideHost;
  let overridePort;
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

    passthroughArgs.push(arg);
  }

  return { overrideHost, overridePort, passthroughArgs };
}

function listLanIpv4Addresses(limit = 2) {
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

async function pickHostPort({ overrideHost, overridePort, runtime }) {
  const startPort = parsePort(overridePort ?? process.env.PORT, 3100);
  const maxOffset = 20;
  const hosts = hostCandidatesWithOverride(overrideHost, runtime);
  let lastError = null;

  for (const host of hosts) {
    for (let offset = 0; offset <= maxOffset; offset += 1) {
      const port = startPort + offset;
      const listened = await canListen({ host, port });
      if (listened.ok) return { host, port };
      lastError = listened.error;
    }
  }
  throw lastError ?? new Error("no available host/port candidate");
}

async function main() {
  const runtime = detectRuntime();
  const { overrideHost, overridePort, passthroughArgs } = parseCliArgs(process.argv.slice(2));
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
  const { host, port } = await pickHostPort({ overrideHost, overridePort, runtime });

  console.log(`Bind: host=${host} port=${port}`);
  if (host === "127.0.0.1" && (runtime.isWSL || runtime.isDocker || runtime.isDevContainer)) {
    console.warn("WARNING: 현재 런타임(WSL/컨테이너)에서는 브라우저가 다른 OS/네임스페이스면 localhost가 연결 거부될 수 있습니다.");
    console.warn("WARNING: pnpm dev:lan 또는 --host 0.0.0.0 사용 후 Open (LAN) URL로 접속하세요.");
  }
  console.log(`Open (same env): http://127.0.0.1:${port}`);
  console.log(`Open (same env): http://localhost:${port}`);
  if (host === "0.0.0.0") {
    for (const ip of listLanIpv4Addresses(2)) {
      console.log(`Open (LAN): http://${ip}:${port}`);
    }
  }

  console.log(`[next_dev_safe] next bin: ${nextBin}`);
  const env = { ...process.env };
  delete env.HOSTNAME;
  delete env.PORT;

  const child = spawn(process.execPath, [nextBin, "dev", "-H", host, "-p", String(port), ...passthroughArgs], {
    stdio: "inherit",
    env,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[next_dev_safe] failed to select host/port:", message);
  process.exit(1);
});
