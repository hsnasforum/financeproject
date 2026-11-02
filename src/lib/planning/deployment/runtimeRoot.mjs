import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_APP_NAME = "PlanningV2";
// Windows statfs reports type 0, so every Windows root check needs a PowerShell drive query;
// a cold PowerShell start on a loaded machine can take several seconds.
const WINDOWS_DRIVE_TYPE_TIMEOUT_MS = 30_000;
const windowsDriveTypeQueries = new Map();
const NETWORK_FILESYSTEM_TYPES = new Set([
  0x00006969, // NFS
  0xff534d42, // CIFS
  0xfe534d42, // SMB2
  0x73757245, // CODA
  0x5346414f, // AFS
  0x0000564c, // NCP
  0x01021997, // 9P / WSL drvfs
]);
const LOCAL_FILESYSTEM_TYPES = new Set([
  0x0000ef53, // ext2/3/4
  0x01021994, // tmpfs
  0x58465342, // XFS
  0x9123683e, // Btrfs
  0x794c7630, // overlayfs
  0x5346544e, // NTFS
  0x00004d44, // FAT
  0x2011bab0, // exFAT
  0x00004244, // HFS
  0x0000001a, // APFS
]);

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeAppName(value) {
  const raw = asString(value);
  if (!raw) return DEFAULT_APP_NAME;
  const sanitized = raw.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").trim();
  return sanitized || DEFAULT_APP_NAME;
}

// Next's build-time file tracing evaluates a direct os.homedir() path and traces the whole tree under it
// (AppData/Local, ~/.local/share). A Windows build on another drive cannot filter those files and fails
// to copy page traces into the standalone output, so resolve the home directory at runtime only.
function resolveUserHomeDirectory() {
  return os.homedir();
}

function resolvePackagedPlanningRoot(env, platform) {
  const appName = sanitizeAppName(env.PLANNING_APP_NAME);
  if (platform === "win32") {
    const localAppData = asString(env.LOCALAPPDATA) || asString(env.APPDATA);
    const base = localAppData || path.join(resolveUserHomeDirectory(), "AppData", "Local");
    return path.resolve(base, appName, "vault");
  }
  const xdgDataHome = asString(env.XDG_DATA_HOME);
  const base = xdgDataHome || path.join(resolveUserHomeDirectory(), ".local", "share");
  return path.resolve(base, appName, "vault");
}

export function resolvePlanningDataRoot(options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const explicit = asString(env.PLANNING_DATA_DIR);
  if (explicit) return path.resolve(cwd, explicit);
  if (env.NODE_ENV !== "production") return path.resolve(cwd, ".data", "planning");
  return resolvePackagedPlanningRoot(env, platform);
}

export function resolvePlanningControlRoot(options = {}) {
  return path.dirname(resolvePlanningDataRoot(options));
}

export function isObviouslySharedDataRoot(dataRoot, platform = process.platform) {
  const raw = asString(dataRoot);
  if (!raw) return true;
  if (raw.startsWith("\\\\") || raw.startsWith("//")) return true;
  if (platform === "win32" && !/^[A-Za-z]:[\\/]/.test(raw)) return true;
  return false;
}

function normalizeFsType(value) {
  if (typeof value !== "number" && typeof value !== "bigint") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric >>> 0;
}

export function classifyPlanningFilesystemType(value) {
  const type = normalizeFsType(value);
  if (type === null) return "unknown";
  if (NETWORK_FILESYSTEM_TYPES.has(type)) return "shared";
  if (LOCAL_FILESYSTEM_TYPES.has(type)) return "local";
  return "unknown";
}

export function classifyPlanningWindowsDriveType(value) {
  const driveType = asString(value).toLowerCase();
  if (driveType === "fixed") return "local";
  if (driveType === "network") return "shared";
  return "unknown";
}

function resolvePlanningWindowsDriveType(dataRoot) {
  const driveRoot = path.win32.parse(dataRoot).root;
  if (!/^[A-Za-z]:\\$/.test(driveRoot)) return Promise.resolve("");
  // Roots on one drive share a single query per process; failed or empty answers are not kept.
  const key = driveRoot.toUpperCase();
  const existing = windowsDriveTypeQueries.get(key);
  if (existing) return existing;
  const query = queryPlanningWindowsDriveType(driveRoot).then(
    (driveType) => {
      if (!driveType) windowsDriveTypeQueries.delete(key);
      return driveType;
    },
    (error) => {
      windowsDriveTypeQueries.delete(key);
      throw error;
    },
  );
  windowsDriveTypeQueries.set(key, query);
  return query;
}

async function queryPlanningWindowsDriveType(driveRoot) {
  const systemRoot = asString(process.env.SystemRoot)
    || asString(process.env.WINDIR);
  if (!/^[A-Za-z]:[\\/]/.test(systemRoot)) return "";
  const powershellPath = path.win32.join(
    systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  const command = "([System.IO.DriveInfo]::new($env:PLANNING_DRIVE_ROOT_QUERY)).DriveType.ToString()";
  return await new Promise((resolve, reject) => {
    execFile(
      powershellPath,
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command],
      {
        encoding: "utf8",
        env: { ...process.env, PLANNING_DRIVE_ROOT_QUERY: driveRoot },
        maxBuffer: 4_096,
        timeout: WINDOWS_DRIVE_TYPE_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(asString(stdout));
      },
    );
  });
}

export async function inspectPlanningDataRoot(options = {}) {
  const platform = options.platform ?? process.platform;
  const resolved = path.resolve(options.dataRoot ?? resolvePlanningDataRoot(options));
  if (isObviouslySharedDataRoot(resolved, platform)) {
    return Object.freeze({ dataRoot: resolved, dataRootKind: "shared", filesystemType: null });
  }

  await fs.mkdir(resolved, { recursive: true });
  const canonical = await fs.realpath(resolved);
  if (isObviouslySharedDataRoot(canonical, platform)) {
    return Object.freeze({ dataRoot: canonical, dataRootKind: "shared", filesystemType: null });
  }

  try {
    const stats = await fs.statfs(canonical);
    const filesystemType = normalizeFsType(stats.type);
    const filesystemKind = classifyPlanningFilesystemType(filesystemType);
    if (filesystemKind !== "unknown" || platform !== "win32") {
      return Object.freeze({
        dataRoot: canonical,
        dataRootKind: filesystemKind,
        filesystemType,
      });
    }
    const windowsDriveType = await resolvePlanningWindowsDriveType(canonical)
      .catch(() => "");
    return Object.freeze({
      dataRoot: canonical,
      dataRootKind: classifyPlanningWindowsDriveType(windowsDriveType),
      filesystemType,
    });
  } catch {
    return Object.freeze({ dataRoot: canonical, dataRootKind: "unknown", filesystemType: null });
  }
}

export function resolvePlanningDatabaseFacts(env = {}) {
  const url = asString(env.DATABASE_URL);
  if (!url || url.startsWith("file:")) {
    return Object.freeze({ databaseProvider: "sqlite", databaseConnection: "file" });
  }
  if (/^(postgres(?:ql)?|mysql|sqlserver|mongodb):/i.test(url)) {
    return Object.freeze({ databaseProvider: "unknown", databaseConnection: "network" });
  }
  return Object.freeze({ databaseProvider: "unknown", databaseConnection: "unknown" });
}
