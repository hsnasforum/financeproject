import fs from "node:fs/promises";
import path from "node:path";
import { resolvePlanningDataDir } from "../server/runtime/dataDir";
import { getVaultStatus } from "../security/vaultState";
import { atomicWriteJson } from "../storage/atomicWrite";
import {
  appendStorageTransactionStep,
  beginStorageTransaction,
  endStorageTransaction,
} from "../storage/journal";
import { getPlanningMigrationDefinition } from "./catalog";
import { applyMigrations, planMigrations, type MigrationPlan } from "./runner";

export type PlanningMigrationStatus = "APPLIED" | "PENDING" | "DEFERRED" | "FAILED";

export type PlanningMigrationItem = {
  id: string;
  title: string;
  status: PlanningMigrationStatus;
  code?: string;
  message: string;
  fixHref?: string;
  requiresVaultUnlocked: boolean;
  details?: Record<string, unknown>;
};

export type PlanningMigrationReport = {
  generatedAt: string;
  statePath: string;
  summary: {
    applied: number;
    pending: number;
    deferred: number;
    failed: number;
  };
  items: PlanningMigrationItem[];
};

export type PlanningMigrationRunResult = PlanningMigrationReport & {
  trigger: "startup" | "ops";
  result: "ok" | "partial" | "failed";
};

type PlanningMigrationState = {
  version: 1;
  updatedAt: string;
  migrations: Record<string, {
    status: "applied" | "pending" | "deferred" | "failed";
    attempts: number;
    appliedAt?: string;
    lastAttemptAt?: string;
    lastMessage?: string;
    lastError?: {
      code: string;
      message: string;
      fixHref?: string;
    };
  }>;
  lastAttempt?: {
    at: string;
    trigger: "startup" | "ops";
    result: "ok" | "partial" | "failed";
  };
};

type RuntimeDetection = {
  item: PlanningMigrationItem;
  plan?: MigrationPlan;
};

const MIGRATION_STATE_VERSION = 1;
const STORAGE_SCHEMA_MIGRATION_ID = "storage-schema-v2";
const VAULT_CONFIG_MIGRATION_ID = "vault-config-v2";

const startupRunPromises = new Map<string, Promise<PlanningMigrationRunResult>>();

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveBaseDir(baseDir?: string): string {
  return path.resolve(baseDir ?? process.cwd());
}

function resolveMigrationStatePath(baseDir?: string): string {
  const root = resolveBaseDir(baseDir);
  const override = asString(process.env.PLANNING_MIGRATION_STATE_PATH);
  if (override) return path.resolve(root, override);
  return path.join(resolvePlanningDataDir({ cwd: root }), "migrations", "migrationState.json");
}

function resolveMigrationSnapshotRoot(baseDir?: string): string {
  const root = resolveBaseDir(baseDir);
  const override = asString(process.env.PLANNING_MIGRATION_SNAPSHOT_DIR);
  if (override) return path.resolve(root, override);
  return path.join(resolvePlanningDataDir({ cwd: root }), "migrations", "snapshots");
}

function resolveVaultConfigPath(baseDir?: string): string {
  const root = resolveBaseDir(baseDir);
  const override = asString(process.env.PLANNING_VAULT_CONFIG_PATH);
  if (override) return path.resolve(root, override);
  return path.join(resolvePlanningDataDir({ cwd: root }), "security", "vault.json");
}

function resolveLegacyVaultConfigPath(baseDir?: string): string {
  const root = resolveBaseDir(baseDir);
  const override = asString(process.env.PLANNING_VAULT_CONFIG_PATH);
  if (override) return path.resolve(root, override);
  return path.join(resolvePlanningDataDir({ cwd: root }), "security", "vault.config.json");
}

function createInitialState(nowIso = new Date().toISOString()): PlanningMigrationState {
  return {
    version: MIGRATION_STATE_VERSION,
    updatedAt: nowIso,
    migrations: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isRecoverableMigrationStateReadError(error: unknown): boolean {
  const nodeError = error as NodeJS.ErrnoException;
  if (nodeError?.code === "ENOENT") return true;
  return error instanceof SyntaxError;
}

function toNormalizedState(raw: unknown): PlanningMigrationState {
  if (!isRecord(raw)) return createInitialState();
  const version = Math.trunc(Number(raw.version));
  const migrationsRaw = isRecord(raw.migrations) ? raw.migrations : {};
  const migrations: PlanningMigrationState["migrations"] = {};

  for (const [id, row] of Object.entries(migrationsRaw)) {
    if (!isRecord(row)) continue;
    const statusRaw = asString(row.status).toLowerCase();
    const status = statusRaw === "applied" || statusRaw === "pending" || statusRaw === "deferred" || statusRaw === "failed"
      ? statusRaw
      : "pending";
    const attempts = Math.max(0, Math.trunc(Number(row.attempts)) || 0);
    const entry: PlanningMigrationState["migrations"][string] = {
      status,
      attempts,
      ...(asString(row.appliedAt) ? { appliedAt: asString(row.appliedAt) } : {}),
      ...(asString(row.lastAttemptAt) ? { lastAttemptAt: asString(row.lastAttemptAt) } : {}),
      ...(asString(row.lastMessage) ? { lastMessage: asString(row.lastMessage) } : {}),
    };
    const lastError = isRecord(row.lastError) ? row.lastError : null;
    if (lastError && asString(lastError.code) && asString(lastError.message)) {
      entry.lastError = {
        code: asString(lastError.code),
        message: asString(lastError.message),
        ...(asString(lastError.fixHref) ? { fixHref: asString(lastError.fixHref) } : {}),
      };
    }
    migrations[id] = entry;
  }

  const lastAttemptRaw = isRecord(raw.lastAttempt) ? raw.lastAttempt : null;
  const lastAttempt: PlanningMigrationState["lastAttempt"] = lastAttemptRaw && asString(lastAttemptRaw.at)
    ? (() => {
      const trigger: "startup" | "ops" = asString(lastAttemptRaw.trigger) === "ops" ? "ops" : "startup";
      const result: "ok" | "partial" | "failed" = asString(lastAttemptRaw.result) === "failed"
        ? "failed"
        : asString(lastAttemptRaw.result) === "partial"
          ? "partial"
          : "ok";
      return {
        at: asString(lastAttemptRaw.at),
        trigger,
        result,
      };
    })()
    : undefined;

  return {
    version: version === MIGRATION_STATE_VERSION ? MIGRATION_STATE_VERSION : MIGRATION_STATE_VERSION,
    updatedAt: asString(raw.updatedAt) || new Date().toISOString(),
    migrations,
    ...(lastAttempt ? { lastAttempt } : {}),
  };
}

async function readMigrationState(baseDir?: string): Promise<PlanningMigrationState> {
  const filePath = resolveMigrationStatePath(baseDir);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return toNormalizedState(JSON.parse(raw) as unknown);
  } catch (error) {
    if (isRecoverableMigrationStateReadError(error)) {
      return createInitialState();
    }
    throw error;
  }
}

async function writeMigrationState(state: PlanningMigrationState, baseDir?: string): Promise<void> {
  const filePath = resolveMigrationStatePath(baseDir);
  await atomicWriteJson(filePath, {
    ...state,
    version: MIGRATION_STATE_VERSION,
    updatedAt: new Date().toISOString(),
  });
}

async function readVaultConfigVersion(baseDir?: string): Promise<{ version: "missing" | "v1" | "v2" | "unknown"; path?: string }> {
  const primary = resolveVaultConfigPath(baseDir);
  const legacy = resolveLegacyVaultConfigPath(baseDir);
  const candidates = primary === legacy ? [primary] : [primary, legacy];

  for (const candidatePath of candidates) {
    try {
      const raw = JSON.parse(await fs.readFile(candidatePath, "utf-8")) as unknown;
      if (isRecord(raw)) {
        if (Math.trunc(Number(raw.vaultVersion)) === 2) {
          return { version: "v2", path: candidatePath };
        }
        if (Math.trunc(Number(raw.version)) === 1) {
          return { version: "v1", path: candidatePath };
        }
      }
      return { version: "unknown", path: candidatePath };
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code === "ENOENT") continue;
      return { version: "unknown", path: candidatePath };
    }
  }

  return { version: "missing" };
}

async function detectStorageSchemaMigration(baseDir?: string): Promise<RuntimeDetection> {
  const def = getPlanningMigrationDefinition(STORAGE_SCHEMA_MIGRATION_ID);
  const vault = await getVaultStatus();
  if (vault.configured && !vault.unlocked) {
    return {
      item: {
        id: STORAGE_SCHEMA_MIGRATION_ID,
        title: def?.title || "Storage schema v2 migration",
        status: "DEFERRED",
        code: "LOCKED",
        message: "Vault가 잠겨 있어 스토리지 마이그레이션을 지연했습니다.",
        fixHref: "/ops/security",
        requiresVaultUnlocked: true,
        details: {
          configured: vault.configured,
          unlocked: vault.unlocked,
        },
      },
    };
  }

  const plan = await planMigrations({ target: "all", baseDir: resolveBaseDir(baseDir) });
  const pendingCount = plan.actions.filter((row) => row.changed && row.errors.length < 1).length;
  const failedRows = plan.actions.filter((row) => row.errors.length > 0);

  if (failedRows.length > 0) {
    return {
      item: {
        id: STORAGE_SCHEMA_MIGRATION_ID,
        title: "Storage schema v2 migration",
        status: "FAILED",
        code: "MIGRATION_FAILED",
        message: `스토리지 마이그레이션 검사 실패 (${failedRows.length}건)`,
        fixHref: "/ops/doctor",
        requiresVaultUnlocked: false,
        details: {
          scanned: plan.scanned,
          sample: failedRows.slice(0, 5),
        },
      },
      plan,
    };
  }

  if (pendingCount > 0) {
    return {
      item: {
        id: STORAGE_SCHEMA_MIGRATION_ID,
        title: "Storage schema v2 migration",
        status: "PENDING",
        message: `적용 가능한 마이그레이션 ${pendingCount}건`,
        fixHref: "/ops/doctor",
        requiresVaultUnlocked: false,
        details: {
          scanned: plan.scanned,
          upgradable: plan.upgradable,
        },
      },
      plan,
    };
  }

  return {
    item: {
      id: STORAGE_SCHEMA_MIGRATION_ID,
      title: "Storage schema v2 migration",
      status: "APPLIED",
      message: "적용할 스토리지 마이그레이션이 없습니다.",
      requiresVaultUnlocked: false,
      details: {
        scanned: plan.scanned,
      },
    },
    plan,
  };
}

async function detectVaultConfigMigration(baseDir?: string): Promise<RuntimeDetection> {
  const def = getPlanningMigrationDefinition(VAULT_CONFIG_MIGRATION_ID);
  const vaultVersion = await readVaultConfigVersion(baseDir);
  if (vaultVersion.version !== "v1") {
    return {
      item: {
        id: VAULT_CONFIG_MIGRATION_ID,
        title: def?.title || "Vault config v2 migration",
        status: "APPLIED",
        message: "Vault 설정 버전이 최신입니다.",
        requiresVaultUnlocked: true,
        details: {
          version: vaultVersion.version,
          ...(vaultVersion.path ? { path: path.relative(resolveBaseDir(baseDir), vaultVersion.path).replaceAll("\\", "/") } : {}),
        },
      },
    };
  }

  const vaultStatus = await getVaultStatus();
  return {
    item: {
      id: VAULT_CONFIG_MIGRATION_ID,
      title: def?.title || "Vault config v2 migration",
      status: "DEFERRED",
      code: "LOCKED",
      message: "Vault v1 설정이 감지되었습니다. /ops/security에서 unlock 시 자동 변환됩니다.",
      fixHref: "/ops/security",
      requiresVaultUnlocked: true,
      details: {
        version: vaultVersion.version,
        ...(vaultVersion.path ? { path: path.relative(resolveBaseDir(baseDir), vaultVersion.path).replaceAll("\\", "/") } : {}),
        unlocked: vaultStatus.unlocked,
      },
    },
  };
}

async function copyPreMigrationSnapshots(
  migrationId: string,
  files: string[],
  baseDir?: string,
): Promise<{ root: string; count: number }> {
  const rootDir = resolveBaseDir(baseDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snapshotRoot = path.resolve(resolveMigrationSnapshotRoot(baseDir), migrationId, stamp);
  await fs.mkdir(snapshotRoot, { recursive: true });

  let copied = 0;
  for (const filePath of files) {
    const absPath = path.resolve(rootDir, filePath);
    const rel = path.relative(rootDir, absPath).replaceAll("\\", "/");
    if (!rel || rel.startsWith("../")) continue;
    const targetPath = path.resolve(snapshotRoot, rel);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.copyFile(absPath, targetPath);
    copied += 1;
  }

  return {
    root: snapshotRoot,
    count: copied,
  };
}

async function applyStorageSchemaMigration(
  detection: RuntimeDetection,
  baseDir?: string,
): Promise<{ applied: boolean; message: string; details?: Record<string, unknown> }> {
  const plan = detection.plan;
  if (!plan) {
    return {
      applied: false,
      message: "migration plan unavailable",
    };
  }

  const targets = plan.actions
    .filter((row) => row.changed && row.errors.length < 1)
    .map((row) => row.path);

  if (targets.length < 1) {
    return {
      applied: true,
      message: "no changes",
      details: { upgradable: 0 },
    };
  }

  const tx = await beginStorageTransaction("MIGRATION_APPLY", {
    migrationId: STORAGE_SCHEMA_MIGRATION_ID,
    targetCount: targets.length,
  });

  try {
    const snapshots = await copyPreMigrationSnapshots(STORAGE_SCHEMA_MIGRATION_ID, targets, baseDir);
    await appendStorageTransactionStep(tx, "SNAPSHOT_COPIED", {
      root: snapshots.root,
      count: snapshots.count,
    });

    const applied = await applyMigrations(plan, { baseDir: resolveBaseDir(baseDir) });
    await appendStorageTransactionStep(tx, "MIGRATIONS_APPLIED", {
      applied: applied.applied,
      failed: applied.failed,
    });

    if (applied.failed > 0) {
      await endStorageTransaction(tx, "ROLLBACK", `failed=${applied.failed}`);
      throw new Error(`MIGRATION_APPLY_FAILED:${applied.failed}`);
    }

    await endStorageTransaction(tx, "COMMIT", `applied=${applied.applied}`);
    return {
      applied: true,
      message: `applied=${applied.applied}`,
      details: {
        applied: applied.applied,
        snapshotRoot: snapshots.root,
      },
    };
  } catch (error) {
    await endStorageTransaction(tx, "ROLLBACK", error instanceof Error ? error.message : "migration error");
    throw error;
  }
}

async function detectAll(baseDir?: string): Promise<RuntimeDetection[]> {
  const storage = await detectStorageSchemaMigration(baseDir);
  const vault = await detectVaultConfigMigration(baseDir);
  return [storage, vault];
}

function summarize(items: PlanningMigrationItem[]): PlanningMigrationReport["summary"] {
  return {
    applied: items.filter((row) => row.status === "APPLIED").length,
    pending: items.filter((row) => row.status === "PENDING").length,
    deferred: items.filter((row) => row.status === "DEFERRED").length,
    failed: items.filter((row) => row.status === "FAILED").length,
  };
}

function toResult(summary: PlanningMigrationReport["summary"]): "ok" | "partial" | "failed" {
  if (summary.failed > 0) return "failed";
  if (summary.pending > 0 || summary.deferred > 0) return "partial";
  return "ok";
}

function applyStateEntry(
  state: PlanningMigrationState,
  item: PlanningMigrationItem,
  nowIso: string,
): void {
  const prev = state.migrations[item.id];
  const attempts = (prev?.attempts ?? 0) + 1;
  const entry: PlanningMigrationState["migrations"][string] = {
    status: item.status === "APPLIED"
      ? "applied"
      : item.status === "FAILED"
        ? "failed"
        : item.status === "DEFERRED"
          ? "deferred"
          : "pending",
    attempts,
    lastAttemptAt: nowIso,
    lastMessage: item.message,
  };
  if (item.status === "APPLIED") {
    entry.appliedAt = prev?.appliedAt || nowIso;
  }
  if (item.code) {
    entry.lastError = {
      code: item.code,
      message: item.message,
      ...(item.fixHref ? { fixHref: item.fixHref } : {}),
    };
  }
  state.migrations[item.id] = entry;
}

export async function inspectPlanningMigrations(options?: {
  baseDir?: string;
}): Promise<PlanningMigrationReport> {
  const detections = await detectAll(options?.baseDir);
  const items = detections.map((row) => row.item);
  const summary = summarize(items);
  return {
    generatedAt: new Date().toISOString(),
    statePath: resolveMigrationStatePath(options?.baseDir),
    summary,
    items,
  };
}

export async function runPlanningMigrations(options?: {
  baseDir?: string;
  trigger?: "startup" | "ops";
}): Promise<PlanningMigrationRunResult> {
  const baseDir = resolveBaseDir(options?.baseDir);
  const trigger = options?.trigger ?? "ops";
  const detections = await detectAll(baseDir);
  const nextItems: PlanningMigrationItem[] = [];

  for (const detection of detections) {
    if (detection.item.id === STORAGE_SCHEMA_MIGRATION_ID && detection.item.status === "PENDING") {
      try {
        const applied = await applyStorageSchemaMigration(detection, baseDir);
        nextItems.push({
          ...detection.item,
          status: "APPLIED",
          message: `스토리지 마이그레이션 완료 (${applied.message})`,
          details: {
            ...(detection.item.details ?? {}),
            ...(applied.details ?? {}),
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "storage migration failed";
        nextItems.push({
          ...detection.item,
          status: "FAILED",
          code: "MIGRATION_FAILED",
          message,
          fixHref: "/ops/doctor",
          details: {
            ...(detection.item.details ?? {}),
          },
        });
      }
      continue;
    }

    nextItems.push(detection.item);
  }

  const summary = summarize(nextItems);
  const result = toResult(summary);
  const nowIso = new Date().toISOString();

  const state = await readMigrationState(baseDir);
  for (const item of nextItems) {
    applyStateEntry(state, item, nowIso);
  }
  state.lastAttempt = {
    at: nowIso,
    trigger,
    result,
  };
  await writeMigrationState(state, baseDir);

  return {
    generatedAt: nowIso,
    trigger,
    result,
    statePath: resolveMigrationStatePath(baseDir),
    summary,
    items: nextItems,
  };
}

export async function runPlanningMigrationsOnStartup(options?: {
  baseDir?: string;
}): Promise<PlanningMigrationRunResult> {
  const key = resolveMigrationStatePath(options?.baseDir);
  const existing = startupRunPromises.get(key);
  if (existing) return existing;

  const created = runPlanningMigrations({
      baseDir: options?.baseDir,
      trigger: "startup",
    }).catch((error) => {
      const nowIso = new Date().toISOString();
      const message = error instanceof Error ? error.message : "startup migration failed";
      return {
        generatedAt: nowIso,
        trigger: "startup" as const,
        result: "failed" as const,
        statePath: resolveMigrationStatePath(options?.baseDir),
        summary: {
          applied: 0,
          pending: 0,
          deferred: 0,
          failed: 1,
        },
        items: [
          {
            id: "startup",
            title: "Startup migration runner",
            status: "FAILED" as const,
            code: "MIGRATION_FAILED",
            message,
            fixHref: "/ops/doctor",
            requiresVaultUnlocked: false,
          },
        ],
      };
    });
  startupRunPromises.set(key, created);
  return created;
}

export function getPlanningMigrationStatePath(baseDir?: string): string {
  return resolveMigrationStatePath(baseDir);
}
