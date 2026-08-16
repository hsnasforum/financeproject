import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolvePlanningRuntimeRoots } from "../src/lib/planning/storage/runtimeRoots.mjs";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function resolvePlanningDataDir(options = {}) {
  return resolvePlanningRuntimeRoots({
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
    platform: options.platform || process.platform,
    homeDir: options.homeDir || os.homedir(),
  }).planningRoot;
}

export function resolveRuntimeLockPath(options = {}) {
  const planningDir = resolvePlanningDataDir(options);
  const pathApi = options.platform === "win32" ? path.win32 : path.posix;
  return pathApi.join(planningDir, "runtime.lock");
}

export function isPidRunning(pid) {
  const parsed = Math.trunc(Number(pid));
  if (!Number.isFinite(parsed) || parsed <= 0) return false;
  try {
    process.kill(parsed, 0);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") return false;
    return true;
  }
}

export function parseLockPayload(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw;
  const pid = Math.trunc(Number(row.pid));
  if (!Number.isFinite(pid) || pid <= 0) return null;
  const startedAt = asString(row.startedAt);
  const url = asString(row.url);
  return {
    pid,
    startedAt: startedAt || new Date().toISOString(),
    url,
  };
}

export function decideActionOnLock(lockPayload, pidAlive) {
  if (!lockPayload) {
    return {
      action: "replace_stale",
      reason: "INVALID_PAYLOAD",
    };
  }
  if (pidAlive) {
    return {
      action: "already_running",
      reason: "PID_RUNNING",
      url: lockPayload.url || "",
    };
  }
  return {
    action: "replace_stale",
    reason: "STALE_LOCK",
  };
}

export async function readLockFile(lockPath) {
  try {
    const raw = await fs.readFile(lockPath, "utf-8");
    const parsed = JSON.parse(raw);
    return parseLockPayload(parsed);
  } catch {
    return null;
  }
}

export async function writeLockFile(lockPath, payload) {
  const normalized = parseLockPayload(payload);
  if (!normalized) {
    throw new Error("invalid runtime lock payload");
  }
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  const content = `${JSON.stringify(normalized, null, 2)}\n`;
  await fs.writeFile(lockPath, content, "utf-8");
}

export async function removeLockFile(lockPath) {
  await fs.rm(lockPath, { force: true }).catch(() => undefined);
}

export async function acquireSingleInstanceLock(lockPath, payload, options = {}) {
  const pidAliveFn = options.pidAliveFn || isPidRunning;
  const normalized = parseLockPayload(payload);
  if (!normalized) {
    throw new Error("invalid lock payload");
  }

  await fs.mkdir(path.dirname(lockPath), { recursive: true });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const handle = await fs.open(lockPath, "wx");
      await handle.writeFile(`${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
      await handle.close();
      return {
        acquired: true,
      };
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : "";
      if (code !== "EEXIST") {
        throw error;
      }

      const existing = await readLockFile(lockPath);
      const alive = existing ? Boolean(await pidAliveFn(existing.pid)) : false;
      const decision = decideActionOnLock(existing, alive);
      if (decision.action === "already_running") {
        return {
          acquired: false,
          url: decision.url || "",
        };
      }

      await removeLockFile(lockPath);
    }
  }

  return {
    acquired: false,
    url: "",
  };
}
