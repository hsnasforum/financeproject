import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { decodeStoragePayload, encodeStoragePayload } from "../security/vaultStorage";
import { atomicWriteJson } from "../storage/atomicWrite";
import { withPlanningStoreWriteLock } from "../storage/storeWriteLock";
import { resolveProfileRunDir, resolveRunDir, sanitizeRecordId } from "./paths";
import {
  type PlanningRunActionPlan,
  type PlanningRunActionPlanItem,
  type PlanningRunActionProgress,
  type PlanningRunActionProgressItem,
  type PlanningRunActionStatus,
  type PlanningRunRecord,
} from "./types";
import { resolveReportResultDtoFromRun } from "../reports/reportInputContract";
import { buildInterpretationVM } from "../v2/insights/interpretationVm";
import { resolveInterpretationActionHref } from "../v2/insights/actionLinks";
import { type GoalStatusRow } from "../v2/resultGuide";
import { type ActionItemV2 } from "../v2/actions/types";
import { roundKrw } from "../calc/roundingPolicy";
import { getRun, listRuns, updateRun } from "./runStore";

const ACTION_PLAN_FILE = "action-plan.json";
const ACTION_PROGRESS_FILE = "action-progress.json";
const ACTION_CENTER_LEGACY_BACKUP_FILE = "action-center-legacy-backup.json";

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("run action store is server-only.");
  }
}

assertServerOnly();

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function createRunActionKey(input: {
  sourceActionId?: string;
  title: string;
  href?: string;
  index: number;
}): string {
  const sourceId = asString(input.sourceActionId).toUpperCase();
  if (sourceId) return sourceId;
  const payload = [
    sourceId,
    normalizeWhitespace(asString(input.title)).toLowerCase(),
    normalizeWhitespace(asString(input.href)).toLowerCase(),
    String(Math.max(0, Math.trunc(input.index))),
  ].join("|");
  const digest = crypto.createHash("sha1").update(payload).digest("hex").slice(0, 16);
  return `act_${digest}`;
}

async function resolveActionDir(runId: string): Promise<string> {
  const run = await getRun(runId);
  if (run?.profileId) {
    return resolveProfileRunDir(run.profileId, run.id);
  }
  return resolveRunDir(runId);
}

async function resolveActionPlanPath(runId: string): Promise<string> {
  return path.join(await resolveActionDir(runId), ACTION_PLAN_FILE);
}

async function resolveActionProgressPath(runId: string): Promise<string> {
  return path.join(await resolveActionDir(runId), ACTION_PROGRESS_FILE);
}

async function resolveActionCenterLegacyBackupPath(runId: string): Promise<string> {
  return path.join(await resolveActionDir(runId), ACTION_CENTER_LEGACY_BACKUP_FILE);
}

function isRecoverableJsonReadError(error: unknown): boolean {
  const nodeError = error as NodeJS.ErrnoException;
  if (nodeError?.code === "ENOENT") return true;
  return error instanceof SyntaxError;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return false;
    throw error;
  }
}

async function readJsonFile(
  filePath: string,
  options?: { rewriteDecoded?: boolean },
): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const loaded = JSON.parse(raw) as unknown;
    const decoded = await decodeStoragePayload(loaded);
    if (decoded.rewriteToVault && options?.rewriteDecoded !== false) {
      await writeJsonAtomic(filePath, decoded.payload);
    }
    return decoded.payload;
  } catch (error) {
    if (isRecoverableJsonReadError(error)) return null;
    throw error;
  }
}

async function writeJsonAtomic(filePath: string, payload: unknown): Promise<void> {
  const stored = await encodeStoragePayload(payload);
  await atomicWriteJson(filePath, stored);
}

function withRunActionWriteLock<T>(runId: string, callback: () => Promise<T> | T): Promise<T> {
  return withPlanningStoreWriteLock(`planning:runs:action-center:${sanitizeRecordId(runId)}`, callback);
}

function isActionStatus(value: unknown): value is PlanningRunActionStatus {
  return value === "todo" || value === "doing" || value === "done" || value === "snoozed";
}

function parseActionPlan(payload: unknown, runId: string): PlanningRunActionPlan | null {
  const row = asRecord(payload);
  if (Number(row.version) !== 1) return null;
  if (asString(row.runId) !== runId) return null;
  const generatedAt = asString(row.generatedAt);
  if (!generatedAt || !Number.isFinite(Date.parse(generatedAt))) return null;
  const items = asArray(row.items).map((entry) => {
    const item = asRecord(entry);
    const actionKey = asString(item.actionKey);
    const title = asString(item.title);
    const description = asString(item.description);
    if (!actionKey || !title || !description) return null;
    return {
      actionKey,
      ...(asString(item.sourceActionId) ? { sourceActionId: asString(item.sourceActionId) } : {}),
      title,
      description,
      steps: asArray(item.steps).map((step) => asString(step)).filter((step) => step.length > 0),
      ...(asString(item.href) ? { href: asString(item.href) } : {}),
    } satisfies PlanningRunActionPlanItem;
  }).filter((entry): entry is PlanningRunActionPlanItem => entry !== null);
  return {
    version: 1,
    runId,
    generatedAt,
    items,
  };
}

function parseActionProgress(payload: unknown, runId: string): PlanningRunActionProgress | null {
  const row = asRecord(payload);
  if (Number(row.version) !== 1) return null;
  if (asString(row.runId) !== runId) return null;
  const updatedAt = asString(row.updatedAt);
  if (!updatedAt || !Number.isFinite(Date.parse(updatedAt))) return null;
  const items = asArray(row.items).map((entry) => {
    const item = asRecord(entry);
    const actionKey = asString(item.actionKey);
    const status = item.status;
    const itemUpdatedAt = asString(item.updatedAt);
    if (!actionKey || !isActionStatus(status) || !itemUpdatedAt) return null;
    return {
      actionKey,
      status,
      ...(asString(item.note) ? { note: asString(item.note) } : {}),
      ...(asString(item.doneAt) ? { doneAt: asString(item.doneAt) } : {}),
      updatedAt: itemUpdatedAt,
    } satisfies PlanningRunActionProgressItem;
  }).filter((entry): entry is PlanningRunActionProgressItem => entry !== null);
  return {
    version: 1,
    runId,
    updatedAt,
    items,
  };
}

type LegacyActionCenterBackup = {
  version: 1;
  runId: string;
  profileId: string;
  backedUpAt: string;
  actionCenter: {
    plan: PlanningRunActionPlan;
    progress: PlanningRunActionProgress;
  };
};

function parseLegacyActionCenterBackup(payload: unknown, runId: string): LegacyActionCenterBackup | null {
  const row = asRecord(payload);
  if (Number(row.version) !== 1) return null;
  if (asString(row.runId) !== runId) return null;
  const backedUpAt = asString(row.backedUpAt);
  if (!backedUpAt || !Number.isFinite(Date.parse(backedUpAt))) return null;
  const profileId = asString(row.profileId);
  if (!profileId) return null;
  const actionCenter = asRecord(row.actionCenter);
  const plan = parseActionPlan(actionCenter.plan, runId);
  const progress = parseActionProgress(actionCenter.progress, runId);
  if (!plan || !progress) return null;
  return {
    version: 1,
    runId,
    profileId,
    backedUpAt,
    actionCenter: {
      plan,
      progress,
    },
  };
}

function goalsFromResultDto(run: PlanningRunRecord): GoalStatusRow[] {
  const dto = resolveReportResultDtoFromRun(run);
  return dto.goals.map((goal) => {
    const target = Number(goal.targetKrw ?? 0);
    const current = Number(goal.currentKrw ?? 0);
    return {
      goalId: goal.id,
      name: goal.title,
      achieved: goal.achieved === true,
      targetMonth: Math.max(0, Math.trunc(Number(goal.targetMonth ?? 0))),
      progressPct: target > 0 ? (current / target) * 100 : 0,
      shortfallKrw: Number(goal.shortfallKrw ?? 0),
      interpretation: asString(goal.comment) || (goal.achieved ? "달성 완료" : "진행 중"),
    };
  });
}

function getActionItemsFromRun(run: PlanningRunRecord): ActionItemV2[] {
  const runActions = Array.isArray(run.outputs.actions?.actions)
    ? run.outputs.actions.actions
    : [];
  if (runActions.length > 0) return runActions;
  const dto = resolveReportResultDtoFromRun(run);
  return dto.actions?.items ?? [];
}

export function buildRunActionPlanItemsFromActionItems(actions: ActionItemV2[]): PlanningRunActionPlanItem[] {
  const usedKeys = new Set<string>();
  return actions.map((action, index) => {
    const baseKey = createRunActionKey({
      sourceActionId: action.code,
      title: action.title,
      index,
    });
    let actionKey = baseKey;
    if (usedKeys.has(actionKey)) {
      let seq = 2;
      while (usedKeys.has(`${baseKey}_${seq}`)) {
        seq += 1;
      }
      actionKey = `${baseKey}_${seq}`;
    }
    usedKeys.add(actionKey);
    const relatedHref = resolveInterpretationActionHref(action.code);
    return {
      actionKey,
      sourceActionId: action.code,
      title: asString(action.title) || `액션 ${index + 1}`,
      description: asString(action.summary) || "세부 실행 단계 확인",
      steps: action.steps.map((step) => asString(step)).filter((step) => step.length > 0).slice(0, 5),
      ...(relatedHref ? { href: relatedHref } : {}),
    } satisfies PlanningRunActionPlanItem;
  });
}

function buildActionPlanFromRun(run: PlanningRunRecord): PlanningRunActionPlan {
  const runActions = getActionItemsFromRun(run);
  if (runActions.length > 0) {
    return {
      version: 1,
      runId: run.id,
      generatedAt: nowIso(),
      items: buildRunActionPlanItemsFromActionItems(runActions),
    };
  }

  const dto = resolveReportResultDtoFromRun(run);
  const monteCarloProbabilities = asRecord(dto.monteCarlo?.probabilities);
  const interpretation = buildInterpretationVM({
    summary: {
      ...(typeof dto.summary.dsrPct === "number" ? { dsrPct: dto.summary.dsrPct } : {}),
      ...(typeof dto.summary.endNetWorthKrw === "number" ? { endNetWorthKrw: dto.summary.endNetWorthKrw } : {}),
      ...(typeof dto.summary.worstCashKrw === "number" ? { worstCashKrw: dto.summary.worstCashKrw } : {}),
    },
    aggregatedWarnings: dto.warnings.aggregated.map((warning) => ({
      code: warning.code,
      severity: warning.severity === "critical" || warning.severity === "warn" ? warning.severity : "info",
      count: warning.count,
      ...(typeof warning.firstMonth === "number" ? { firstMonth: warning.firstMonth } : {}),
      ...(typeof warning.lastMonth === "number" ? { lastMonth: warning.lastMonth } : {}),
      ...(asString(warning.sampleMessage) ? { sampleMessage: asString(warning.sampleMessage) } : {}),
    })),
    goals: goalsFromResultDto(run),
    outcomes: {
      actionsTop: asArray(dto.actions?.top3).map((entry) => asRecord(entry) as ActionItemV2),
      snapshotMeta: {
        ...(dto.meta.snapshot.missing ? { missing: true } : {}),
        ...(typeof dto.meta.health?.snapshotStaleDays === "number" ? { staleDays: dto.meta.health.snapshotStaleDays } : {}),
      },
      monteCarlo: {
        ...(typeof monteCarloProbabilities.retirementDepletionBeforeEnd === "number"
          ? { retirementDepletionBeforeEnd: monteCarloProbabilities.retirementDepletionBeforeEnd }
          : {}),
      },
      runId: run.id,
    },
  });

  const generatedAt = nowIso();
  const items = interpretation.nextActions.map((action, index) => {
    const sourceActionId = asString(action.id);
    return {
    actionKey: createRunActionKey({
      sourceActionId,
      title: action.title,
      href: action.href,
      index,
    }),
    ...(sourceActionId ? { sourceActionId } : {}),
    title: asString(action.title) || `액션 ${index + 1}`,
    description: asString(action.description) || "세부 실행 단계 확인",
    steps: action.steps.map((step) => asString(step)).filter((step) => step.length > 0).slice(0, 5),
    ...(asString(action.href) ? { href: asString(action.href) } : {}),
    };
  });

  return {
    version: 1,
    runId: run.id,
    generatedAt,
    items,
  };
}

export type RunActionProgressSummary = {
  total: number;
  done: number;
  doing: number;
  todo: number;
  snoozed: number;
  completionPct: number;
};

export function summarizeRunActionProgress(progress: PlanningRunActionProgress): RunActionProgressSummary {
  const total = progress.items.length;
  const done = progress.items.filter((item) => item.status === "done").length;
  const doing = progress.items.filter((item) => item.status === "doing").length;
  const todo = progress.items.filter((item) => item.status === "todo").length;
  const snoozed = progress.items.filter((item) => item.status === "snoozed").length;
  const completionPct = total > 0 ? roundKrw((done / total) * 100) : 0;
  return { total, done, doing, todo, snoozed, completionPct };
}

export async function getRunActionPlan(runId: string): Promise<PlanningRunActionPlan | null> {
  const safeRunId = sanitizeRecordId(runId);
  const loaded = await readJsonFile(await resolveActionPlanPath(safeRunId));
  return parseActionPlan(loaded, safeRunId);
}

export async function ensureRunActionPlan(run: PlanningRunRecord): Promise<PlanningRunActionPlan> {
  const safeRunId = sanitizeRecordId(run.id);
  return withRunActionWriteLock(safeRunId, async () => {
    const existing = await getRunActionPlan(safeRunId);
    if (existing) return existing;

    const generated = buildActionPlanFromRun(run);
    await writeJsonAtomic(await resolveActionPlanPath(safeRunId), generated);
    return generated;
  });
}

function buildDefaultProgress(plan: PlanningRunActionPlan): PlanningRunActionProgress {
  const updatedAt = nowIso();
  return {
    version: 1,
    runId: plan.runId,
    updatedAt,
    items: plan.items.map((item) => ({
      actionKey: item.actionKey,
      status: "todo",
      updatedAt,
    })),
  };
}

function mergeProgressWithPlan(
  plan: PlanningRunActionPlan,
  current: PlanningRunActionProgress | null,
): PlanningRunActionProgress {
  if (!current) return buildDefaultProgress(plan);
  const updatedAt = nowIso();
  const byKey = new Map(current.items.map((item) => [item.actionKey, item]));
  return {
    version: 1,
    runId: plan.runId,
    updatedAt,
    items: plan.items.map((item) => {
      const existing = byKey.get(item.actionKey);
      if (!existing) {
        return {
          actionKey: item.actionKey,
          status: "todo" as const,
          updatedAt,
        };
      }
      return {
        actionKey: item.actionKey,
        status: existing.status,
        ...(asString(existing.note) ? { note: asString(existing.note) } : {}),
        ...(asString(existing.doneAt) ? { doneAt: asString(existing.doneAt) } : {}),
        updatedAt: existing.updatedAt,
      };
    }),
  };
}

function shouldRewriteProgress(
  current: PlanningRunActionProgress | null,
  next: PlanningRunActionProgress,
): boolean {
  return !current
    || current.items.length !== next.items.length
    || current.items.some((item, index) => {
      const nextItem = next.items[index];
      if (!nextItem) return true;
      return item.actionKey !== nextItem.actionKey
        || item.status !== nextItem.status
        || asString(item.note) !== asString(nextItem.note)
        || asString(item.doneAt) !== asString(nextItem.doneAt);
    });
}

export async function getRunActionProgress(runId: string): Promise<PlanningRunActionProgress | null> {
  const safeRunId = sanitizeRecordId(runId);
  const loaded = await readJsonFile(await resolveActionProgressPath(safeRunId));
  return parseActionProgress(loaded, safeRunId);
}

export async function ensureRunActionProgress(
  run: PlanningRunRecord,
  planInput?: PlanningRunActionPlan,
): Promise<PlanningRunActionProgress> {
  const safeRunId = sanitizeRecordId(run.id);
  return withRunActionWriteLock(safeRunId, async () => {
    const plan = planInput ?? await ensureRunActionPlan(run);
    const loaded = await readJsonFile(await resolveActionProgressPath(safeRunId));
    const parsed = parseActionProgress(loaded, safeRunId);
    const merged = mergeProgressWithPlan(plan, parsed);

    if (shouldRewriteProgress(parsed, merged)) {
      await writeJsonAtomic(await resolveActionProgressPath(safeRunId), merged);
    }
    return merged;
  });
}

export async function getRunActionProgressSummaries(
  runs: PlanningRunRecord[],
): Promise<Record<string, RunActionProgressSummary>> {
  const entries = await Promise.all(runs.map(async (run) => {
    try {
      const progress = await getRunActionProgress(run.id) ?? run.actionCenter?.progress ?? null;
      if (!progress) return null;
      return [run.id, summarizeRunActionProgress(progress)] as const;
    } catch {
      return null;
    }
  }));
  return Object.fromEntries(
    entries.filter(
      (entry): entry is readonly [string, RunActionProgressSummary] => entry !== null,
    ),
  );
}

export type RunActionCenterMigrationItem = {
  runId: string;
  profileId: string;
  status: "candidate" | "migrated" | "rolled-back" | "skipped" | "failed";
  reason: string;
  canonicalPlan: "missing" | "present" | "invalid" | "not-checked";
  canonicalProgress: "missing" | "present" | "invalid" | "not-checked";
  backupWritten: boolean;
  embeddedRemoved: boolean;
  rollbackVerified: boolean;
};

export type RunActionCenterMigrationReport = {
  version: 1;
  mode: "dry-run" | "apply" | "rollback";
  dryRun: boolean;
  generatedAt: string;
  summary: {
    scanned: number;
    candidates: number;
    migrated: number;
    rolledBack: number;
    skipped: number;
    failed: number;
    backupsWritten: number;
    embeddedRemoved: number;
    planFilesWritten: number;
    progressFilesWritten: number;
    rollbackVerified: number;
  };
  items: RunActionCenterMigrationItem[];
};

type ActionCenterCanonicalState = {
  plan: "missing" | "present" | "invalid";
  progress: "missing" | "present" | "invalid";
  parsedPlan: PlanningRunActionPlan | null;
  parsedProgress: PlanningRunActionProgress | null;
};

async function readCanonicalActionCenterState(
  runId: string,
  options?: { rewriteDecoded?: boolean },
): Promise<ActionCenterCanonicalState> {
  const safeRunId = sanitizeRecordId(runId);
  const planPath = await resolveActionPlanPath(safeRunId);
  const progressPath = await resolveActionProgressPath(safeRunId);
  const planExists = await fileExists(planPath);
  const progressExists = await fileExists(progressPath);
  const parsedPlan = parseActionPlan(await readJsonFile(planPath, options), safeRunId);
  const parsedProgress = parseActionProgress(await readJsonFile(progressPath, options), safeRunId);
  return {
    plan: parsedPlan ? "present" : planExists ? "invalid" : "missing",
    progress: parsedProgress ? "present" : progressExists ? "invalid" : "missing",
    parsedPlan,
    parsedProgress,
  };
}

function createMigrationItem(input: {
  run: PlanningRunRecord;
  status: RunActionCenterMigrationItem["status"];
  reason: string;
  canonical?: Partial<Pick<RunActionCenterMigrationItem, "canonicalPlan" | "canonicalProgress">>;
  backupWritten?: boolean;
  embeddedRemoved?: boolean;
  rollbackVerified?: boolean;
}): RunActionCenterMigrationItem {
  return {
    runId: input.run.id,
    profileId: input.run.profileId,
    status: input.status,
    reason: input.reason,
    canonicalPlan: input.canonical?.canonicalPlan ?? "not-checked",
    canonicalProgress: input.canonical?.canonicalProgress ?? "not-checked",
    backupWritten: input.backupWritten === true,
    embeddedRemoved: input.embeddedRemoved === true,
    rollbackVerified: input.rollbackVerified === true,
  };
}

function summarizeMigrationItems(items: RunActionCenterMigrationItem[]): RunActionCenterMigrationReport["summary"] {
  return {
    scanned: items.length,
    candidates: items.filter((item) => item.status === "candidate").length,
    migrated: items.filter((item) => item.status === "migrated").length,
    rolledBack: items.filter((item) => item.status === "rolled-back").length,
    skipped: items.filter((item) => item.status === "skipped").length,
    failed: items.filter((item) => item.status === "failed").length,
    backupsWritten: items.filter((item) => item.backupWritten).length,
    embeddedRemoved: items.filter((item) => item.embeddedRemoved).length,
    planFilesWritten: items.filter((item) => item.reason.includes("plan-written")).length,
    progressFilesWritten: items.filter((item) => item.reason.includes("progress-written")).length,
    rollbackVerified: items.filter((item) => item.rollbackVerified).length,
  };
}

async function migrateOneEmbeddedActionCenter(run: PlanningRunRecord): Promise<RunActionCenterMigrationItem> {
  const embedded = run.actionCenter;
  if (!embedded) {
    return createMigrationItem({ run, status: "skipped", reason: "no-embedded-action-center" });
  }
  const plan = parseActionPlan(embedded.plan, run.id);
  const progress = parseActionProgress(embedded.progress, run.id);
  if (!plan || !progress) {
    return createMigrationItem({ run, status: "failed", reason: "invalid-embedded-action-center" });
  }

  const canonical = await readCanonicalActionCenterState(run.id);
  if (canonical.plan === "invalid" || canonical.progress === "invalid") {
    return createMigrationItem({
      run,
      status: "failed",
      reason: "invalid-canonical-file",
      canonical: {
        canonicalPlan: canonical.plan,
        canonicalProgress: canonical.progress,
      },
    });
  }

  const backup: LegacyActionCenterBackup = {
    version: 1,
    runId: run.id,
    profileId: run.profileId,
    backedUpAt: nowIso(),
    actionCenter: {
      plan,
      progress,
    },
  };
  await writeJsonAtomic(await resolveActionCenterLegacyBackupPath(run.id), backup);
  let planWritten = false;
  let progressWritten = false;
  if (!canonical.parsedPlan) {
    await writeJsonAtomic(await resolveActionPlanPath(run.id), plan);
    planWritten = true;
  }
  if (!canonical.parsedProgress) {
    await writeJsonAtomic(await resolveActionProgressPath(run.id), progress);
    progressWritten = true;
  }
  await updateRun(run.id, { actionCenter: null });

  const reasonParts = [
    "embedded-migrated",
    ...(planWritten ? ["plan-written"] : []),
    ...(progressWritten ? ["progress-written"] : []),
  ];
  return createMigrationItem({
    run,
    status: "migrated",
    reason: reasonParts.join(","),
    canonical: {
      canonicalPlan: canonical.plan,
      canonicalProgress: canonical.progress,
    },
    backupWritten: true,
    embeddedRemoved: true,
  });
}

async function rollbackOneEmbeddedActionCenter(run: PlanningRunRecord): Promise<RunActionCenterMigrationItem> {
  const backup = parseLegacyActionCenterBackup(
    await readJsonFile(await resolveActionCenterLegacyBackupPath(run.id)),
    run.id,
  );
  if (!backup) {
    return createMigrationItem({ run, status: "skipped", reason: "no-valid-backup" });
  }
  await updateRun(run.id, { actionCenter: backup.actionCenter });
  const restored = await getRun(run.id);
  const rollbackVerified = restored?.actionCenter?.progress.updatedAt === backup.actionCenter.progress.updatedAt
    && restored.actionCenter.plan.generatedAt === backup.actionCenter.plan.generatedAt;
  return createMigrationItem({
    run,
    status: rollbackVerified ? "rolled-back" : "failed",
    reason: rollbackVerified ? "embedded-restored" : "rollback-verification-failed",
    rollbackVerified,
  });
}

export async function migrateEmbeddedRunActionCenters(options?: {
  dryRun?: boolean;
  rollback?: boolean;
  limit?: number;
}): Promise<RunActionCenterMigrationReport> {
  const dryRun = options?.dryRun !== false;
  const rollback = options?.rollback === true;
  const mode: RunActionCenterMigrationReport["mode"] = rollback ? "rollback" : dryRun ? "dry-run" : "apply";
  const limit = Math.max(1, Math.trunc(Number(options?.limit ?? 500)));
  const runs = await listRuns({ limit });
  const items: RunActionCenterMigrationItem[] = [];

  for (const run of runs) {
    if (rollback) {
      const backup = parseLegacyActionCenterBackup(
        await readJsonFile(await resolveActionCenterLegacyBackupPath(run.id), { rewriteDecoded: !dryRun }),
        run.id,
      );
      if (!backup) {
        items.push(createMigrationItem({ run, status: "skipped", reason: "no-valid-backup" }));
        continue;
      }
      items.push(dryRun
        ? createMigrationItem({ run, status: "candidate", reason: "rollback-backup-found" })
        : await rollbackOneEmbeddedActionCenter(run));
      continue;
    }

    const embedded = run.actionCenter;
    if (!embedded) {
      items.push(createMigrationItem({ run, status: "skipped", reason: "no-embedded-action-center" }));
      continue;
    }
    const plan = parseActionPlan(embedded.plan, run.id);
    const progress = parseActionProgress(embedded.progress, run.id);
    if (!plan || !progress) {
      items.push(createMigrationItem({ run, status: "failed", reason: "invalid-embedded-action-center" }));
      continue;
    }
    const canonical = await readCanonicalActionCenterState(run.id, { rewriteDecoded: !dryRun });
    if (canonical.plan === "invalid" || canonical.progress === "invalid") {
      items.push(createMigrationItem({
        run,
        status: "failed",
        reason: "invalid-canonical-file",
        canonical: {
          canonicalPlan: canonical.plan,
          canonicalProgress: canonical.progress,
        },
      }));
      continue;
    }
    items.push(dryRun
      ? createMigrationItem({
        run,
        status: "candidate",
        reason: "embedded-action-center-found",
        canonical: {
          canonicalPlan: canonical.plan,
          canonicalProgress: canonical.progress,
        },
      })
      : await migrateOneEmbeddedActionCenter(run));
  }

  return {
    version: 1,
    mode,
    dryRun,
    generatedAt: nowIso(),
    summary: summarizeMigrationItems(items),
    items,
  };
}

export async function updateRunActionProgress(
  runId: string,
  input: {
    actionKey: string;
    status?: PlanningRunActionStatus;
    note?: string;
  },
): Promise<PlanningRunActionProgress> {
  const safeRunId = sanitizeRecordId(runId);
  return withRunActionWriteLock(safeRunId, async () => {
    const run = await getRun(safeRunId);
    if (!run) {
      throw new Error("RUN_NOT_FOUND");
    }
    const progress = await ensureRunActionProgress(run);
    const actionKey = asString(input.actionKey);
    if (!actionKey) {
      throw new Error("ACTION_KEY_REQUIRED");
    }
    const index = progress.items.findIndex((item) => item.actionKey === actionKey);
    if (index < 0) {
      throw new Error("ACTION_KEY_NOT_FOUND");
    }
    if (input.status !== undefined && !isActionStatus(input.status)) {
      throw new Error("ACTION_STATUS_INVALID");
    }
    const current = progress.items[index];
    const note = input.note === undefined ? current.note : asString(input.note);
    const nextStatus = input.status ?? current.status;
    const updatedAt = nowIso();
    const nextItem: PlanningRunActionProgressItem = {
      ...current,
      status: nextStatus,
      ...(note ? { note } : {}),
      ...(nextStatus === "done" ? { doneAt: current.doneAt ?? updatedAt } : {}),
      updatedAt,
    };
    if (!note) {
      delete (nextItem as { note?: string }).note;
    }
    if (nextStatus !== "done") {
      delete (nextItem as { doneAt?: string }).doneAt;
    }
    const next: PlanningRunActionProgress = {
      ...progress,
      updatedAt,
      items: progress.items.map((item, itemIndex) => (itemIndex === index ? nextItem : item)),
    };
    await writeJsonAtomic(await resolveActionProgressPath(safeRunId), next);
    return next;
  });
}
