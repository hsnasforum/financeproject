import fs from "node:fs/promises";
import path from "node:path";
import { resolvePlanningOpsPaths } from "./planning_runtime_paths.mjs";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toInt(value, fallback) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeKeep(value, fallback = 50) {
  return Math.max(1, Math.min(500, toInt(value, fallback)));
}

export function makeTimestampToken(input = new Date()) {
  const row = input instanceof Date ? input : new Date(input);
  if (!Number.isFinite(row.getTime())) return "unknown";
  const yyyy = row.getUTCFullYear();
  const mm = String(row.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(row.getUTCDate()).padStart(2, "0");
  const hh = String(row.getUTCHours()).padStart(2, "0");
  const mi = String(row.getUTCMinutes()).padStart(2, "0");
  const ss = String(row.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}Z`;
}

export async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    const nodeError = error;
    if (nodeError?.code === "ENOENT") return null;
    throw error;
  }
}

export async function writeJsonAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  await fs.rename(tmpPath, filePath);
}

export async function writeTextAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmpPath, value, "utf-8");
  await fs.rename(tmpPath, filePath);
}

export function tailText(text, maxLines = 40, maxChars = 6000) {
  const input = asString(text);
  if (!input) return "";
  const lines = input.split(/\r?\n/).slice(-maxLines);
  const joined = lines.join("\n");
  if (joined.length <= maxChars) return joined;
  return joined.slice(-maxChars);
}

export async function pruneDirectoryKeepLatest(dirPath, keep, suffix = "") {
  const safeKeep = normalizeKeep(keep, 50);
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    const nodeError = error;
    if (nodeError?.code === "ENOENT") {
      return { purged: 0, kept: 0 };
    }
    throw error;
  }

  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => !suffix || name.toLowerCase().endsWith(suffix.toLowerCase()))
    .sort((a, b) => b.localeCompare(a));

  const toDelete = files.slice(safeKeep);
  for (const name of toDelete) {
    await fs.rm(path.join(dirPath, name), { force: true });
  }
  return {
    purged: toDelete.length,
    kept: Math.min(files.length, safeKeep),
  };
}

export async function pruneOpsArtifacts(cwd = process.cwd(), keep = 50) {
  const safeKeep = normalizeKeep(keep, 50);
  const { logs: logsAbs, reports: reportsAbs } = resolvePlanningOpsPaths({ cwd });
  const reports = await pruneDirectoryKeepLatest(reportsAbs, safeKeep, ".json");
  const logs = await pruneDirectoryKeepLatest(logsAbs, safeKeep, ".log");
  return {
    keep: safeKeep,
    purgedReports: reports.purged,
    purgedLogs: logs.purged,
    keptReports: reports.kept,
    keptLogs: logs.kept,
  };
}
