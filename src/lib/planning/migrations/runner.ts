import fs from "node:fs/promises";
import path from "node:path";
import { ASSUMPTIONS_HISTORY_DIR, ASSUMPTIONS_PATH } from "../assumptions/storage.ts";
import { encryptPlanningJson, isPlanningEncryptedEnvelope } from "../crypto/encrypt";
import { atomicWriteJson } from "../storage/atomicWrite";
import { getPlanningUserDir, sanitizePlanningUserId } from "../store/namespace";
import { PROFILES_DIR, RUNS_DIR } from "../store/paths.ts";
import { migrateAnyFile, type MigrationFileKind } from "./index.ts";

export type MigrationTarget = "profiles" | "runs" | "snapshots" | "all";

type MigrationActionKind = "PROFILE" | "RUN" | "SNAPSHOT";

export type MigrationPlan = {
  target: MigrationTarget;
  scanned: number;
  upgradable: number;
  failed: number;
  actions: Array<{
    kind: MigrationActionKind;
    path: string;
    fromVersion: number;
    toVersion: number;
    changed: boolean;
    warnings: string[];
    errors: string[];
  }>;
  summary: { changedCount: number; failedCount: number };
};

type RunnerOptions = {
  baseDir?: string;
};

type NamespaceRunnerOptions = {
  baseDir?: string;
  userId: string;
};

type NamespaceApplyOptions = NamespaceRunnerOptions & {
  encryptionPassphrase?: string;
};

type NamespaceAction = {
  kind: "PROFILE" | "RUN";
  fromPath: string;
  toPath: string;
  movable: boolean;
  warnings: string[];
  errors: string[];
};

export type NamespaceMigrationPlan = {
  userId: string;
  scanned: number;
  movable: number;
  failed: number;
  actions: NamespaceAction[];
  summary: {
    movableCount: number;
    failedCount: number;
  };
};

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/");
}

function toRelativePath(baseDir: string, absPath: string): string {
  const relative = normalizePath(path.relative(baseDir, absPath));
  if (!relative || relative.startsWith("../")) {
    throw new Error("MIGRATION_PATH_OUT_OF_SCOPE");
  }
  return relative;
}

async function listJsonFiles(dirPath: string): Promise<string[]> {
  let entries: Awaited<ReturnType<typeof fs.readdir>>;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return [];
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => path.join(dirPath, entry.name));
}

function mapActionKind(kind: MigrationFileKind): MigrationActionKind {
  if (kind === "profile") return "PROFILE";
  if (kind === "run") return "RUN";
  return "SNAPSHOT";
}

async function readJsonFile(filePath: string): Promise<{ ok: true; json: unknown } | { ok: false; error: string }> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return {
      ok: true,
      json: JSON.parse(raw) as unknown,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "READ_OR_PARSE_FAILED";
    return { ok: false, error: message };
  }
}

async function writeJsonAtomic(filePath: string, payload: unknown): Promise<void> {
  await atomicWriteJson(filePath, payload);
}

export async function planMigrations(
  args: { target?: MigrationTarget } & RunnerOptions = {},
): Promise<MigrationPlan> {
  const baseDir = path.resolve(args.baseDir ?? process.cwd());
  const target = args.target ?? "all";
  const actions: MigrationPlan["actions"] = [];

  const profileFiles = target === "all" || target === "profiles"
    ? await listJsonFiles(path.resolve(baseDir, PROFILES_DIR))
    : [];
  const runFiles = target === "all" || target === "runs"
    ? await listJsonFiles(path.resolve(baseDir, RUNS_DIR))
    : [];
  const snapshotFiles = target === "all" || target === "snapshots"
    ? [
      ...(await listJsonFiles(path.resolve(baseDir, ASSUMPTIONS_HISTORY_DIR))),
      ...(await listJsonFiles(path.resolve(baseDir, path.dirname(ASSUMPTIONS_PATH)))).filter((filePath) => path.basename(filePath) === path.basename(ASSUMPTIONS_PATH)),
    ]
    : [];

  const jobs: Array<{ kind: MigrationFileKind; filePath: string }> = [
    ...profileFiles.map((filePath) => ({ kind: "profile" as const, filePath })),
    ...runFiles.map((filePath) => ({ kind: "run" as const, filePath })),
    ...snapshotFiles.map((filePath) => ({ kind: "snapshot" as const, filePath })),
  ];

  for (const job of jobs) {
    const relativePath = toRelativePath(baseDir, job.filePath);
    const loaded = await readJsonFile(job.filePath);
    if (!loaded.ok) {
      actions.push({
        kind: mapActionKind(job.kind),
        path: relativePath,
        fromVersion: 0,
        toVersion: 1,
        changed: false,
        warnings: [],
        errors: [`INVALID_JSON:${loaded.error}`],
      });
      continue;
    }

    const migrated = migrateAnyFile(job.kind, loaded.json);
    actions.push({
      kind: mapActionKind(job.kind),
      path: relativePath,
      fromVersion: migrated.fromVersion,
      toVersion: migrated.toVersion,
      changed: migrated.changed,
      warnings: migrated.warnings,
      errors: migrated.errors,
    });
  }

  const scanned = actions.length;
  const upgradable = actions.filter((row) => row.changed && row.errors.length < 1).length;
  const failed = actions.filter((row) => row.errors.length > 0).length;
  const changedCount = actions.filter((row) => row.changed).length;

  return {
    target,
    scanned,
    upgradable,
    failed,
    actions,
    summary: {
      changedCount,
      failedCount: failed,
    },
  };
}

export async function applyMigrations(
  plan: MigrationPlan,
  options: RunnerOptions = {},
): Promise<{ applied: number; failed: number }> {
  const baseDir = path.resolve(options.baseDir ?? process.cwd());
  let applied = 0;
  let failed = 0;

  for (const action of plan.actions) {
    if (!action.changed || action.errors.length > 0) continue;

    const absPath = path.resolve(baseDir, action.path);
    const relPath = toRelativePath(baseDir, absPath);
    if (relPath !== action.path) {
      failed += 1;
      continue;
    }

    const loaded = await readJsonFile(absPath);
    if (!loaded.ok) {
      failed += 1;
      continue;
    }

    const kind: MigrationFileKind = action.kind === "PROFILE"
      ? "profile"
      : action.kind === "RUN"
        ? "run"
        : "snapshot";
    const migrated = migrateAnyFile(kind, loaded.json);
    if (!migrated.ok || !migrated.data) {
      failed += 1;
      continue;
    }

    const backupPath = `${absPath}.bak`;
    try {
      await fs.copyFile(absPath, backupPath);
      await writeJsonAtomic(absPath, migrated.data);
      applied += 1;
    } catch {
      failed += 1;
    }
  }

  return { applied, failed };
}

export async function planNamespaceMigration(
  options: NamespaceRunnerOptions,
): Promise<NamespaceMigrationPlan> {
  const baseDir = path.resolve(options.baseDir ?? process.cwd());
  const userId = sanitizePlanningUserId(options.userId);

  const legacyProfiles = await listJsonFiles(path.resolve(baseDir, PROFILES_DIR));
  const legacyRuns = await listJsonFiles(path.resolve(baseDir, RUNS_DIR));
  const targetRoot = getPlanningUserDir(userId, baseDir);

  const actions: NamespaceAction[] = [];
  for (const filePath of legacyProfiles) {
    const fileName = path.basename(filePath);
    const targetPath = path.join(targetRoot, "profiles", fileName);
    let movable = true;
    const warnings: string[] = [];
    const errors: string[] = [];
    try {
      await fs.access(targetPath);
      movable = false;
      errors.push("TARGET_ALREADY_EXISTS");
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code !== "ENOENT") {
        movable = false;
        errors.push("TARGET_CHECK_FAILED");
      }
    }
    actions.push({
      kind: "PROFILE",
      fromPath: toRelativePath(baseDir, filePath),
      toPath: toRelativePath(baseDir, targetPath),
      movable,
      warnings,
      errors,
    });
  }

  for (const filePath of legacyRuns) {
    const fileName = path.basename(filePath);
    const targetPath = path.join(targetRoot, "runs", fileName);
    let movable = true;
    const warnings: string[] = [];
    const errors: string[] = [];
    try {
      await fs.access(targetPath);
      movable = false;
      errors.push("TARGET_ALREADY_EXISTS");
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code !== "ENOENT") {
        movable = false;
        errors.push("TARGET_CHECK_FAILED");
      }
    }
    actions.push({
      kind: "RUN",
      fromPath: toRelativePath(baseDir, filePath),
      toPath: toRelativePath(baseDir, targetPath),
      movable,
      warnings,
      errors,
    });
  }

  const scanned = actions.length;
  const movable = actions.filter((row) => row.movable && row.errors.length < 1).length;
  const failed = actions.filter((row) => row.errors.length > 0).length;

  return {
    userId,
    scanned,
    movable,
    failed,
    actions,
    summary: {
      movableCount: movable,
      failedCount: failed,
    },
  };
}

export async function applyNamespaceMigration(
  plan: NamespaceMigrationPlan,
  options: NamespaceApplyOptions,
): Promise<{ moved: number; failed: number; encrypted: number }> {
  const baseDir = path.resolve(options.baseDir ?? process.cwd());
  let moved = 0;
  let failed = 0;
  let encrypted = 0;

  for (const action of plan.actions) {
    if (!action.movable || action.errors.length > 0) continue;
    const fromAbsPath = path.resolve(baseDir, action.fromPath);
    const toAbsPath = path.resolve(baseDir, action.toPath);

    try {
      await fs.mkdir(path.dirname(toAbsPath), { recursive: true });
      await fs.copyFile(fromAbsPath, `${fromAbsPath}.bak`);
      await fs.rename(fromAbsPath, toAbsPath);
      moved += 1;
    } catch {
      failed += 1;
      continue;
    }

    if (options.encryptionPassphrase?.trim()) {
      try {
        const raw = await fs.readFile(toAbsPath, "utf-8");
        const parsed = JSON.parse(raw) as unknown;
        if (!isPlanningEncryptedEnvelope(parsed)) {
          const encryptedPayload = await encryptPlanningJson(parsed, options.encryptionPassphrase);
          await writeJsonAtomic(toAbsPath, encryptedPayload);
          encrypted += 1;
        }
      } catch {
        // keep moved plaintext file when source is invalid JSON
      }
    }
  }

  return { moved, failed, encrypted };
}
