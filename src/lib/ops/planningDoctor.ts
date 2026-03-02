import fs from "node:fs/promises";
import path from "node:path";
import { resolvePlanningDataDir } from "../planning/storage/dataDir";

export type PlanningIntegrityReport = {
  ok: boolean;
  missing: string[];
  invalidJson: string[];
  counts: {
    profiles: number;
    runs: number;
    assumptionsHistory: number;
  };
  optionalMissing: string[];
  notes: string[];
};

type CheckPlanningIntegrityOptions = {
  strict?: boolean;
  baseDir?: string;
};

const REQUIRED_FILES = ["assumptions.latest.json"] as const;
const OPTIONAL_FILES = ["eval/latest.json"] as const;
const OPTIONAL_DIRS = [
  "cache",
  "eval/history",
] as const;

function normalizePath(value: string): string {
  return String(value ?? "").trim().replaceAll("\\", "/");
}

function toRelative(baseDir: string, absolutePath: string): string {
  return normalizePath(path.relative(baseDir, absolutePath));
}

async function pathStat(filePath: string): Promise<import("node:fs").Stats | null> {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return null;
    throw error;
  }
}

async function parseJsonFile(filePath: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    JSON.parse(raw);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "JSON_PARSE_FAILED",
    };
  }
}

async function scanJsonDir(baseDir: string, relativeDir: string): Promise<{
  exists: boolean;
  count: number;
  invalidJson: string[];
}> {
  const absoluteDir = path.resolve(baseDir, relativeDir);
  const stat = await pathStat(absoluteDir);
  if (!stat || !stat.isDirectory()) {
    return { exists: false, count: 0, invalidJson: [] };
  }

  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  const jsonFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => path.join(absoluteDir, entry.name));

  const invalidJson: string[] = [];
  for (const filePath of jsonFiles) {
    const parsed = await parseJsonFile(filePath);
    if (!parsed.ok) {
      invalidJson.push(`${toRelative(baseDir, filePath)} (${parsed.reason})`);
    }
  }

  return {
    exists: true,
    count: jsonFiles.length,
    invalidJson,
  };
}

export async function checkPlanningIntegrity(options: CheckPlanningIntegrityOptions = {}): Promise<PlanningIntegrityReport> {
  const baseDir = path.resolve(options.baseDir ?? process.cwd());
  const planningRoot = resolvePlanningDataDir({ cwd: baseDir });
  const strict = options.strict === true;
  const missing: string[] = [];
  const invalidJson: string[] = [];
  const optionalMissing: string[] = [];
  const notes: string[] = [];

  for (const relativePath of REQUIRED_FILES) {
    const absolutePath = path.join(planningRoot, relativePath);
    const reportPath = toRelative(baseDir, absolutePath);
    const stat = await pathStat(absolutePath);
    if (!stat || !stat.isFile()) {
      missing.push(reportPath);
      notes.push(`${reportPath}: 파일이 없습니다.`);
      continue;
    }
    const parsed = await parseJsonFile(absolutePath);
    if (!parsed.ok) {
      invalidJson.push(`${reportPath} (${parsed.reason})`);
    }
  }

  const assumptionsHistory = await scanJsonDir(baseDir, toRelative(baseDir, path.join(planningRoot, "assumptions/history")));
  if (!assumptionsHistory.exists) {
    missing.push(toRelative(baseDir, path.join(planningRoot, "assumptions/history")));
    notes.push("assumptions history 디렉토리가 없습니다. (초기 상태일 수 있음)");
  }
  invalidJson.push(...assumptionsHistory.invalidJson);

  const profiles = await scanJsonDir(baseDir, toRelative(baseDir, path.join(planningRoot, "profiles")));
  if (!profiles.exists) {
    missing.push(toRelative(baseDir, path.join(planningRoot, "profiles")));
    notes.push("profiles 디렉토리가 없습니다. (신규 사용자일 수 있음)");
  }
  invalidJson.push(...profiles.invalidJson);

  const runs = await scanJsonDir(baseDir, toRelative(baseDir, path.join(planningRoot, "runs")));
  if (!runs.exists) {
    missing.push(toRelative(baseDir, path.join(planningRoot, "runs")));
    notes.push("runs 디렉토리가 없습니다. (아직 실행 기록이 없을 수 있음)");
  }
  invalidJson.push(...runs.invalidJson);

  for (const relativePath of OPTIONAL_FILES) {
    const absolutePath = path.join(planningRoot, relativePath);
    const reportPath = toRelative(baseDir, absolutePath);
    const stat = await pathStat(absolutePath);
    if (!stat || !stat.isFile()) {
      optionalMissing.push(reportPath);
      continue;
    }
    const parsed = await parseJsonFile(absolutePath);
    if (!parsed.ok) {
      invalidJson.push(`${reportPath} (${parsed.reason})`);
    }
  }

  for (const relativeDir of OPTIONAL_DIRS) {
    const reportPath = toRelative(baseDir, path.join(planningRoot, relativeDir));
    const scanned = await scanJsonDir(baseDir, reportPath);
    if (!scanned.exists) {
      optionalMissing.push(reportPath);
      continue;
    }
    invalidJson.push(...scanned.invalidJson);
  }

  if (!strict && missing.includes(toRelative(baseDir, path.join(planningRoot, "assumptions.latest.json")))) {
    notes.push("assumptions.latest.json 없음: 스냅샷 미동기화 상태일 수 있습니다.");
  }

  const hasStrictMissing = strict && missing.length > 0;
  return {
    ok: invalidJson.length < 1 && !hasStrictMissing,
    missing,
    invalidJson,
    counts: {
      profiles: profiles.count,
      runs: runs.count,
      assumptionsHistory: assumptionsHistory.count,
    },
    optionalMissing,
    notes,
  };
}
