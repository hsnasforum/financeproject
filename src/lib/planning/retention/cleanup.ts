import fs from "node:fs/promises";
import { type Dirent } from "node:fs";
import path from "node:path";
import { resolvePlanningDataDir } from "../server/runtime/dataDir";
import { resolveRunsDir } from "../store/paths";
import {
  listPlanningTrash,
} from "../store/trash";
import {
  loadPlanningRetentionPolicy,
  type PlanningRetentionPolicy,
} from "./policy";

export type CleanupTarget =
  | "runs"
  | "cache"
  | "opsReports"
  | "assumptionsHistory"
  | "trash"
  | "all";

export type CleanupAction = {
  kind: "DELETE_FILE";
  path: string;
  reason: string;
  sizeBytes?: number;
  absPath?: string;
};

export type CleanupPlan = {
  target: CleanupTarget;
  policy: PlanningRetentionPolicy;
  nowIso: string;
  actions: CleanupAction[];
  summary: {
    deleteCount: number;
    totalBytes?: number;
    byTarget: Record<string, number>;
  };
};

type PlanCleanupArgs = {
  target?: CleanupTarget;
  policy?: PlanningRetentionPolicy;
  nowIso?: string;
  baseDir?: string;
};

type ApplyCleanupResult = {
  deleted: number;
  bytes?: number;
  failed?: Array<{ path: string; message: string }>;
};

type ApplyCleanupOptions = {
  baseDir?: string;
};

type FileRow = {
  absPath: string;
  relPath: string;
  name: string;
  sizeBytes: number;
  mtimeMs: number;
};

type RunMeta = {
  file: FileRow;
  profileId: string;
  createdMs: number;
};

const CACHE_USAGE_STATS_FILE = "_usage.stats.json";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeIso(input: unknown): string {
  const raw = asString(input);
  if (!raw) return new Date().toISOString();
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return new Date().toISOString();
  return new Date(parsed).toISOString();
}

function toMs(iso: string | undefined): number | undefined {
  const parsed = Date.parse(asString(iso));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function daysBetween(nowMs: number, pastMs: number): number {
  return Math.floor(Math.max(0, nowMs - pastMs) / (24 * 60 * 60 * 1000));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseTarget(value: unknown): CleanupTarget {
  const raw = asString(value);
  if (raw === "runs" || raw === "cache" || raw === "opsReports" || raw === "assumptionsHistory" || raw === "trash" || raw === "all") {
    return raw;
  }
  return "all";
}

function targetEnabled(target: CleanupTarget, name: Exclude<CleanupTarget, "all">): boolean {
  return target === "all" || target === name;
}

function resolveBaseDir(input?: string): string {
  return path.resolve(input || process.cwd());
}

function relativePath(baseDir: string, absPath: string): string {
  return path.relative(baseDir, absPath).replaceAll("\\", "/");
}

function resolveCacheDir(baseDir: string): string {
  const override = asString(process.env.PLANNING_CACHE_DIR);
  if (override) return path.resolve(baseDir, override);
  return path.join(resolvePlanningDataDir({ cwd: baseDir }), "cache");
}

function resolveOpsReportsDir(baseDir: string): string {
  const override = asString(process.env.PLANNING_OPS_REPORTS_DIR);
  if (override) return path.resolve(baseDir, override);
  return path.join(resolvePlanningDataDir({ cwd: baseDir }), "ops", "reports");
}

function resolveAssumptionsHistoryDir(baseDir: string): string {
  const override = asString(process.env.PLANNING_ASSUMPTIONS_HISTORY_DIR);
  if (override) return path.resolve(baseDir, override);
  return path.join(resolvePlanningDataDir({ cwd: baseDir }), "assumptions", "history");
}

async function walkFiles(dirPath: string, baseDir: string): Promise<FileRow[]> {
  const out: FileRow[] = [];
  async function visit(current: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const absPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(absPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const stat = await fs.stat(absPath).catch(() => null);
      if (!stat) continue;
      out.push({
        absPath,
        relPath: relativePath(baseDir, absPath),
        name: entry.name,
        sizeBytes: stat.size,
        mtimeMs: stat.mtimeMs,
      });
    }
  }
  await visit(dirPath);
  return out;
}

async function parseRunMeta(files: FileRow[]): Promise<{
  parsed: RunMeta[];
  invalid: CleanupAction[];
}> {
  const parsed: RunMeta[] = [];
  const invalid: CleanupAction[] = [];
  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(file.absPath, "utf-8");
      const payload = JSON.parse(raw) as unknown;
      if (!isRecord(payload)) {
        invalid.push({
          kind: "DELETE_FILE",
          path: file.relPath,
          reason: "runs.invalid_json",
          sizeBytes: file.sizeBytes,
          absPath: file.absPath,
        });
        continue;
      }
      const profileId = asString(payload.profileId);
      if (!profileId) {
        invalid.push({
          kind: "DELETE_FILE",
          path: file.relPath,
          reason: "runs.invalid_profile_id",
          sizeBytes: file.sizeBytes,
          absPath: file.absPath,
        });
        continue;
      }
      const createdMs = toMs(asString(payload.createdAt)) ?? file.mtimeMs;
      parsed.push({ file, profileId, createdMs });
    } catch {
      invalid.push({
        kind: "DELETE_FILE",
        path: file.relPath,
        reason: "runs.invalid_json",
        sizeBytes: file.sizeBytes,
        absPath: file.absPath,
      });
    }
  }
  return { parsed, invalid };
}

function uniqueActions(rows: CleanupAction[]): CleanupAction[] {
  const map = new Map<string, CleanupAction>();
  for (const row of rows) {
    const key = `${row.kind}|${row.path}`;
    if (!map.has(key)) map.set(key, row);
  }
  return [...map.values()];
}

function buildSummary(actions: CleanupAction[]): CleanupPlan["summary"] {
  const byTarget: Record<string, number> = {
    runs: 0,
    cache: 0,
    opsReports: 0,
    assumptionsHistory: 0,
    trash: 0,
  };
  let totalBytes = 0;
  for (const action of actions) {
    const rel = action.path;
    if (rel.includes("/runs/")) byTarget.runs += 1;
    else if (rel.includes("/cache/")) byTarget.cache += 1;
    else if (rel.includes("/ops/reports/")) byTarget.opsReports += 1;
    else if (rel.includes("/assumptions/history/")) byTarget.assumptionsHistory += 1;
    else if (rel.includes("/trash/")) byTarget.trash += 1;
    totalBytes += action.sizeBytes ?? 0;
  }
  return {
    deleteCount: actions.length,
    totalBytes,
    byTarget,
  };
}

export async function planPlanningCleanup(args: PlanCleanupArgs = {}): Promise<CleanupPlan> {
  const target = parseTarget(args.target);
  const policy = args.policy ?? loadPlanningRetentionPolicy();
  const nowIso = safeIso(args.nowIso);
  const nowMs = Date.parse(nowIso);
  const baseDir = resolveBaseDir(args.baseDir);

  const actions: CleanupAction[] = [];

  if (targetEnabled(target, "runs")) {
    const runsDir = resolveRunsDir(baseDir);
    const runFiles = await walkFiles(runsDir, baseDir);
    const { parsed, invalid } = await parseRunMeta(runFiles);
    actions.push(...invalid);

    const grouped = new Map<string, RunMeta[]>();
    for (const row of parsed) {
      const list = grouped.get(row.profileId) ?? [];
      list.push(row);
      grouped.set(row.profileId, list);
    }
    for (const list of grouped.values()) {
      const sorted = [...list].sort((a, b) => {
        if (b.createdMs !== a.createdMs) return b.createdMs - a.createdMs;
        return b.file.relPath.localeCompare(a.file.relPath);
      });
      const keepPerProfile = Math.max(1, Math.trunc(policy.runs.keepPerProfile));
      for (const [index, row] of sorted.entries()) {
        const oldByCount = index >= keepPerProfile;
        const oldByDays = typeof policy.runs.keepDays === "number"
          && daysBetween(nowMs, row.createdMs) > policy.runs.keepDays;
        if (!oldByCount && !oldByDays) continue;
        actions.push({
          kind: "DELETE_FILE",
          path: row.file.relPath,
          reason: oldByCount ? "runs.keep_per_profile" : "runs.keep_days",
          sizeBytes: row.file.sizeBytes,
          absPath: row.file.absPath,
        });
      }
    }
  }

  if (targetEnabled(target, "cache")) {
    const cacheDir = resolveCacheDir(baseDir);
    const cacheFiles = await walkFiles(cacheDir, baseDir);
    for (const file of cacheFiles) {
      if (!file.name.toLowerCase().endsWith(".json")) continue;
      if (file.name === CACHE_USAGE_STATS_FILE) continue;
      try {
        const raw = await fs.readFile(file.absPath, "utf-8");
        const payload = JSON.parse(raw) as unknown;
        if (!isRecord(payload)) {
          actions.push({
            kind: "DELETE_FILE",
            path: file.relPath,
            reason: "cache.invalid_json",
            sizeBytes: file.sizeBytes,
            absPath: file.absPath,
          });
          continue;
        }
        const createdMs = toMs(asString(payload.createdAt)) ?? file.mtimeMs;
        const expiresMs = toMs(asString(payload.expiresAt));
        const expired = expiresMs !== undefined && expiresMs <= nowMs;
        const old = daysBetween(nowMs, createdMs) > policy.cache.keepDays;
        if (!expired && !old) continue;
        actions.push({
          kind: "DELETE_FILE",
          path: file.relPath,
          reason: expired ? "cache.expired" : "cache.keep_days",
          sizeBytes: file.sizeBytes,
          absPath: file.absPath,
        });
      } catch {
        actions.push({
          kind: "DELETE_FILE",
          path: file.relPath,
          reason: "cache.invalid_json",
          sizeBytes: file.sizeBytes,
          absPath: file.absPath,
        });
      }
    }
  }

  if (targetEnabled(target, "opsReports")) {
    const reportsDir = resolveOpsReportsDir(baseDir);
    const reportFiles = (await walkFiles(reportsDir, baseDir))
      .filter((row) => row.name.toLowerCase().endsWith(".json"))
      .sort((a, b) => b.name.localeCompare(a.name));
    const keep = Math.max(1, Math.trunc(policy.opsReports.keepCount));
    for (const row of reportFiles.slice(keep)) {
      actions.push({
        kind: "DELETE_FILE",
        path: row.relPath,
        reason: "ops_reports.keep_count",
        sizeBytes: row.sizeBytes,
        absPath: row.absPath,
      });
    }
  }

  if (targetEnabled(target, "assumptionsHistory")) {
    const historyDir = resolveAssumptionsHistoryDir(baseDir);
    const historyFiles = (await walkFiles(historyDir, baseDir))
      .filter((row) => row.name.toLowerCase().endsWith(".json"));
    const withRank = await Promise.all(historyFiles.map(async (row) => {
      try {
        const raw = await fs.readFile(row.absPath, "utf-8");
        const payload = JSON.parse(raw) as unknown;
        const fetchedMs = isRecord(payload) ? toMs(asString(payload.fetchedAt)) : undefined;
        return { row, rankMs: fetchedMs ?? row.mtimeMs };
      } catch {
        return { row, rankMs: row.mtimeMs };
      }
    }));
    withRank.sort((a, b) => {
      if (b.rankMs !== a.rankMs) return b.rankMs - a.rankMs;
      return b.row.name.localeCompare(a.row.name);
    });
    const keep = Math.max(1, Math.trunc(policy.assumptionsHistory.keepCount));
    for (const item of withRank.slice(keep)) {
      actions.push({
        kind: "DELETE_FILE",
        path: item.row.relPath,
        reason: "assumptions_history.keep_count",
        sizeBytes: item.row.sizeBytes,
        absPath: item.row.absPath,
      });
    }
  }

  if (targetEnabled(target, "trash")) {
    const trashItems = await listPlanningTrash("all", 5000, baseDir);
    for (const item of trashItems) {
      const deletedMs = Date.parse(item.deletedAt);
      if (!Number.isFinite(deletedMs)) continue;
      const ageDays = daysBetween(nowMs, deletedMs);
      if (ageDays <= policy.trash.keepDays) continue;
      actions.push({
        kind: "DELETE_FILE",
        path: item.pathRelative,
        reason: "trash.keep_days",
        sizeBytes: item.sizeBytes,
      });
      if (item.kind === "reports") {
        actions.push({
          kind: "DELETE_FILE",
          path: item.pathRelative.replace(/\.md$/i, ".meta.json"),
          reason: "trash.keep_days",
        });
      }
    }
  }

  const deduped = uniqueActions(actions);
  return {
    target,
    policy,
    nowIso,
    actions: deduped,
    summary: buildSummary(deduped),
  };
}

export async function applyPlanningCleanup(
  plan: CleanupPlan,
  options: ApplyCleanupOptions = {},
): Promise<ApplyCleanupResult> {
  const baseDir = resolveBaseDir(options.baseDir);
  const failed: Array<{ path: string; message: string }> = [];
  let deleted = 0;
  let bytes = 0;

  for (const action of plan.actions) {
    if (action.kind !== "DELETE_FILE") continue;
    const plannedAbsPath = asString(action.absPath);
    const absPath = plannedAbsPath ? path.resolve(plannedAbsPath) : path.resolve(baseDir, action.path);
    const normalizedBase = `${baseDir}${path.sep}`;
    if (!plannedAbsPath && !(absPath === baseDir || absPath.startsWith(normalizedBase))) {
      failed.push({
        path: action.path,
        message: "OUTSIDE_BASE_DIR",
      });
      continue;
    }
    try {
      await fs.unlink(absPath);
      deleted += 1;
      bytes += action.sizeBytes ?? 0;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code === "ENOENT") continue;
      failed.push({
        path: action.path,
        message: nodeError?.message || "DELETE_FAILED",
      });
    }
  }

  return {
    deleted,
    bytes,
    ...(failed.length > 0 ? { failed } : {}),
  };
}
