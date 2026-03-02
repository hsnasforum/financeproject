import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { decodeStoragePayload, encodeStoragePayload } from "../security/vaultStorage";
import { resolveProfileRunDir, resolveRunDir, sanitizeRecordId } from "./paths";
import {
  type PlanningRunActionPlan,
  type PlanningRunActionPlanItem,
  type PlanningRunActionProgress,
  type PlanningRunActionProgressItem,
  type PlanningRunActionStatus,
  type PlanningRunRecord,
} from "./types";
import { getRun } from "./runStore";
import { buildResultDtoV1FromRunRecord, isResultDtoV1 } from "../v2/resultDto";
import { buildInterpretationVM } from "../v2/insights/interpretationVm";
import { type GoalRow } from "../v2/report/mapGoals";
import { type ActionItemV2 } from "../v2/actions/types";

const ACTION_PLAN_FILE = "action-plan.json";
const ACTION_PROGRESS_FILE = "action-progress.json";

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
  const payload = [
    asString(input.sourceActionId).toUpperCase(),
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

async function readJsonFile(filePath: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const loaded = JSON.parse(raw) as unknown;
    const decoded = await decodeStoragePayload(loaded);
    if (decoded.rewriteToVault) {
      await writeJsonAtomic(filePath, decoded.payload);
    }
    return decoded.payload;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJsonAtomic(filePath: string, payload: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const stored = await encodeStoragePayload(payload);
  await fs.writeFile(tmpPath, `${JSON.stringify(stored, null, 2)}\n`, "utf-8");
  await fs.rename(tmpPath, filePath);
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

function goalsFromResultDto(run: PlanningRunRecord): GoalRow[] {
  const dto = isResultDtoV1(run.outputs.resultDto)
    ? run.outputs.resultDto
    : buildResultDtoV1FromRunRecord(run);
  return dto.goals.map((goal) => ({
    name: goal.title,
    targetAmount: Number(goal.targetKrw ?? 0),
    currentAmount: Number(goal.currentKrw ?? 0),
    shortfall: Number(goal.shortfallKrw ?? 0),
    targetMonth: Math.max(0, Math.trunc(Number(goal.targetMonth ?? 0))),
    achieved: goal.achieved === true,
    comment: asString(goal.comment),
  }));
}

function buildActionPlanFromRun(run: PlanningRunRecord): PlanningRunActionPlan {
  const dto = isResultDtoV1(run.outputs.resultDto)
    ? run.outputs.resultDto
    : buildResultDtoV1FromRunRecord(run);
  const interpretation = buildInterpretationVM({
    summary: {
      ...(typeof dto.summary.monthlySurplusKrw === "number" ? { monthlySurplusKrw: dto.summary.monthlySurplusKrw } : {}),
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
        ...(typeof dto.monteCarlo?.probabilities.retirementDepletionBeforeEnd === "number"
          ? { retirementDepletionBeforeEnd: dto.monteCarlo.probabilities.retirementDepletionBeforeEnd }
          : {}),
      },
    },
  });

  const generatedAt = nowIso();
  const items = interpretation.nextActions.map((action, index) => ({
    actionKey: createRunActionKey({
      sourceActionId: action.id,
      title: action.title,
      href: action.href,
      index,
    }),
    ...(asString(action.id) ? { sourceActionId: asString(action.id) } : {}),
    title: asString(action.title) || `액션 ${index + 1}`,
    description: asString(action.description) || "세부 실행 단계 확인",
    steps: action.steps.map((step) => asString(step)).filter((step) => step.length > 0).slice(0, 5),
    ...(asString(action.href) ? { href: asString(action.href) } : {}),
  }));

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
  const completionPct = total > 0 ? Math.round((done / total) * 100) : 0;
  return { total, done, doing, todo, snoozed, completionPct };
}

export async function getRunActionPlan(runId: string): Promise<PlanningRunActionPlan | null> {
  const safeRunId = sanitizeRecordId(runId);
  const loaded = await readJsonFile(await resolveActionPlanPath(safeRunId));
  return parseActionPlan(loaded, safeRunId);
}

export async function ensureRunActionPlan(run: PlanningRunRecord): Promise<PlanningRunActionPlan> {
  const safeRunId = sanitizeRecordId(run.id);
  const existing = await getRunActionPlan(safeRunId);
  if (existing) return existing;

  const generated = buildActionPlanFromRun(run);
  await writeJsonAtomic(await resolveActionPlanPath(safeRunId), generated);
  return generated;
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
        updatedAt: existing.updatedAt,
      };
    }),
  };
}

export async function getRunActionProgress(runId: string): Promise<PlanningRunActionProgress | null> {
  const safeRunId = sanitizeRecordId(runId);
  const run = await getRun(safeRunId);
  if (!run) return null;
  const plan = await ensureRunActionPlan(run);
  const loaded = await readJsonFile(await resolveActionProgressPath(safeRunId));
  const parsed = parseActionProgress(loaded, safeRunId);
  const merged = mergeProgressWithPlan(plan, parsed);

  const changed = !parsed
    || parsed.items.length !== merged.items.length
    || parsed.items.some((item, index) => {
      const next = merged.items[index];
      if (!next) return true;
      return item.actionKey !== next.actionKey || item.status !== next.status || asString(item.note) !== asString(next.note);
    });
  if (changed) {
    await writeJsonAtomic(await resolveActionProgressPath(safeRunId), merged);
  }
  return merged;
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
  const progress = await getRunActionProgress(safeRunId);
  if (!progress) {
    throw new Error("RUN_NOT_FOUND");
  }
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
  const updatedAt = nowIso();
  const nextItem: PlanningRunActionProgressItem = {
    ...current,
    ...(input.status ? { status: input.status } : {}),
    ...(note ? { note } : {}),
    updatedAt,
  };
  if (!note) {
    delete (nextItem as { note?: string }).note;
  }
  const next: PlanningRunActionProgress = {
    ...progress,
    updatedAt,
    items: progress.items.map((item, itemIndex) => (itemIndex === index ? nextItem : item)),
  };
  await writeJsonAtomic(await resolveActionProgressPath(safeRunId), next);
  return next;
}
