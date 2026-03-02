import { loadOpsPolicy } from "../opsPolicy";
import { planRunsRetention } from "../runsRetention";
import { buildAssumptionsSnapshot } from "../../planning/assumptions/sync";
import { inspectPlanningMigrations, runPlanningMigrations } from "../../planning/migrations/manager";
import { deleteRun, listRunIndexEntries } from "../../planning/server/store/runStore";
import { checkPlanningStorageConsistency, repairRunIndexConsistency } from "../../planning/storage/consistency";
import {
  type OpsActionDefinition,
  type OpsActionId,
  type OpsActionParams,
  type OpsActionPreviewResult,
  type OpsActionRunResult,
} from "./types";

const PREVIEW_ID_LIMIT = 20;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toOptionalInt(value: unknown): number | undefined {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return undefined;
  return parsed;
}

function toSafeId(input: unknown): string {
  const value = asString(input);
  if (!value) return "";
  return value.replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 80);
}

function normalizeCleanupParams(params: OpsActionParams): { keepDays: number; keepCount: number; profileId?: string; confirmText?: string } {
  const policy = loadOpsPolicy();
  const keepDays = Math.min(toOptionalInt(params.keepDays) ?? policy.runs.defaultKeepDays, policy.runs.maxKeepDays);
  const keepCount = Math.min(toOptionalInt(params.keepCount) ?? policy.runs.defaultKeepCount, policy.runs.maxKeepCount);
  const profileId = asString(params.profileId);
  const confirmText = asString(params.confirmText);
  return {
    keepDays,
    keepCount,
    ...(profileId ? { profileId } : {}),
    ...(confirmText ? { confirmText } : {}),
  };
}

async function previewAssumptionsRefreshAction(): Promise<OpsActionPreviewResult> {
  return {
    ok: true,
    summary: {
      text: "새 가정 스냅샷을 생성합니다.",
    },
  };
}

async function previewCleanupAction(params: OpsActionParams): Promise<OpsActionPreviewResult> {
  const normalized = normalizeCleanupParams(params);
  const rows = await listRunIndexEntries({
    ...(normalized.profileId ? { profileId: normalized.profileId } : {}),
    limit: 50_000,
    offset: 0,
  });

  const plan = planRunsRetention(
    rows.map((row) => ({
      id: row.id,
      profileId: row.profileId,
      createdAt: row.createdAt,
    })),
    {
      keepDays: normalized.keepDays,
      keepCount: normalized.keepCount,
      ...(normalized.profileId ? { profileId: normalized.profileId } : {}),
    },
  );

  const ids = plan.remove.map((row) => toSafeId(row.id)).filter((row) => row.length > 0);
  return {
    ok: true,
    summary: {
      text: `삭제 예정 ${plan.remove.length}건 (총 ${plan.total}건)` ,
      counts: {
        total: plan.total,
        kept: plan.kept,
        toDelete: plan.remove.length,
      },
      ids: ids.slice(0, PREVIEW_ID_LIMIT),
      truncated: ids.length > PREVIEW_ID_LIMIT,
    },
  };
}

async function previewRepairIndexAction(): Promise<OpsActionPreviewResult> {
  const report = await checkPlanningStorageConsistency();
  const ids = report.issues
    .map((issue) => toSafeId(issue.code))
    .filter((row) => row.length > 0);
  return {
    ok: true,
    summary: {
      text: `정합성 이슈 total=${report.summary.total}, fail=${report.summary.fail}, warn=${report.summary.warn}`,
      counts: {
        total: report.summary.total,
        fail: report.summary.fail,
        warn: report.summary.warn,
      },
      ids: ids.slice(0, PREVIEW_ID_LIMIT),
      truncated: ids.length > PREVIEW_ID_LIMIT,
    },
  };
}

async function previewRunMigrationsAction(): Promise<OpsActionPreviewResult> {
  const report = await inspectPlanningMigrations();
  const ids = report.items
    .map((item) => `${toSafeId(item.id)}:${toSafeId(item.status)}`)
    .filter((row) => row.length > 0);
  return {
    ok: true,
    summary: {
      text: `migration applied=${report.summary.applied}, pending=${report.summary.pending}, deferred=${report.summary.deferred}, failed=${report.summary.failed}`,
      counts: {
        applied: report.summary.applied,
        pending: report.summary.pending,
        deferred: report.summary.deferred,
        failed: report.summary.failed,
      },
      ids: ids.slice(0, PREVIEW_ID_LIMIT),
      truncated: ids.length > PREVIEW_ID_LIMIT,
    },
  };
}

async function runAssumptionsRefreshAction(): Promise<OpsActionRunResult> {
  const refreshed = await buildAssumptionsSnapshot();
  const latestId = asString(refreshed.snapshotId);
  const warningsCount = Array.isArray(refreshed.snapshot.warnings) ? refreshed.snapshot.warnings.length : 0;
  return {
    ok: true,
    message: warningsCount > 0
      ? `가정 스냅샷을 새로고침했습니다. (id=${latestId}, warnings=${warningsCount})`
      : `가정 스냅샷을 새로고침했습니다. (id=${latestId})`,
    data: {
      latestId,
      warningsCount,
    },
  };
}

async function runCleanupAction(params: OpsActionParams): Promise<OpsActionRunResult> {
  const normalized = normalizeCleanupParams(params);
  const rows = await listRunIndexEntries({
    ...(normalized.profileId ? { profileId: normalized.profileId } : {}),
    limit: 50000,
    offset: 0,
  });

  const plan = planRunsRetention(
    rows.map((row) => ({
      id: row.id,
      profileId: row.profileId,
      createdAt: row.createdAt,
    })),
    {
      keepDays: normalized.keepDays,
      keepCount: normalized.keepCount,
      ...(normalized.profileId ? { profileId: normalized.profileId } : {}),
    },
  );

  let deletedCount = 0;
  const failed: Array<{ id: string; message: string }> = [];
  for (const target of plan.remove) {
    try {
      const deleted = await deleteRun(target.id);
      if (deleted) deletedCount += 1;
    } catch (error) {
      failed.push({
        id: toSafeId(target.id),
        message: error instanceof Error ? error.message : "DELETE_FAILED",
      });
    }
  }

  const failedCount = failed.length;
  return {
    ok: failedCount < 1,
    message: failedCount > 0
      ? `실행 기록 ${deletedCount}건 정리 완료, ${failedCount}건 실패`
      : `실행 기록 ${deletedCount}건 정리 완료`,
    data: {
      keepDays: normalized.keepDays,
      keepCount: normalized.keepCount,
      profileId: normalized.profileId || null,
      total: plan.total,
      kept: plan.kept,
      plannedDelete: plan.remove.length,
      deleted: deletedCount,
      failedCount,
      failed: failed.slice(0, 20),
    },
  };
}

async function runRepairIndexAction(): Promise<OpsActionRunResult> {
  const result = await repairRunIndexConsistency();
  return {
    ok: true,
    message: `runs index 수리 완료 (entries=${result.entries}, updated=${result.updated})`,
    data: {
      entries: result.entries,
      updated: result.updated,
    },
  };
}

async function runMigrationsAction(): Promise<OpsActionRunResult> {
  const result = await runPlanningMigrations({ trigger: "ops" });
  return {
    ok: result.result !== "failed",
    message: `migrations 실행 결과: ${result.result} (applied=${result.summary.applied}, pending=${result.summary.pending}, deferred=${result.summary.deferred}, failed=${result.summary.failed})`,
    data: {
      result: result.result,
      summary: result.summary,
    },
  };
}

const ACTION_DEFINITIONS: Record<OpsActionId, OpsActionDefinition> = {
  ASSUMPTIONS_REFRESH: {
    id: "ASSUMPTIONS_REFRESH",
    title: "가정 스냅샷 새로고침",
    description: "최신 가정 스냅샷을 생성합니다.",
  },
  RUNS_CLEANUP: {
    id: "RUNS_CLEANUP",
    title: "실행 기록 정리",
    description: "보존 정책을 기준으로 오래된 실행 기록을 정리합니다.",
    dangerous: true,
    requirePreview: true,
    confirmText: "RUN OPS_RUNS_CLEANUP",
  },
  REPAIR_INDEX: {
    id: "REPAIR_INDEX",
    title: "Runs 인덱스 수리",
    description: "runs index와 실제 폴더 정합성을 다시 맞춥니다.",
    dangerous: true,
    requirePreview: true,
    confirmText: "RUN OPS_REPAIR_INDEX",
  },
  RUN_MIGRATIONS: {
    id: "RUN_MIGRATIONS",
    title: "마이그레이션 실행",
    description: "대기 중인 planning 마이그레이션을 실행합니다.",
    dangerous: true,
    requirePreview: true,
    confirmText: "RUN OPS_MIGRATIONS",
  },
};

export const OPS_ACTION_REGISTRY: Record<OpsActionId, OpsActionDefinition> = ACTION_DEFINITIONS;

export function getOpsActionDefinition(actionId: string): OpsActionDefinition | null {
  const normalized = asString(actionId).toUpperCase();
  if (!normalized) return null;
  return OPS_ACTION_REGISTRY[normalized as OpsActionId] ?? null;
}

export function validateOpsActionParams(actionId: OpsActionId, params: unknown): OpsActionParams {
  const row = params && typeof params === "object" && !Array.isArray(params)
    ? params as Record<string, unknown>
    : {};

  if (actionId === "RUNS_CLEANUP") {
    const normalized = normalizeCleanupParams(row as OpsActionParams);
    return {
      keepDays: normalized.keepDays,
      keepCount: normalized.keepCount,
      ...(normalized.profileId ? { profileId: normalized.profileId } : {}),
      ...(normalized.confirmText ? { confirmText: normalized.confirmText } : {}),
    };
  }

  if (actionId === "REPAIR_INDEX" || actionId === "RUN_MIGRATIONS") {
    const confirmText = asString(row.confirmText);
    return {
      ...(confirmText ? { confirmText } : {}),
    };
  }

  return {};
}

export async function previewOpsAction(actionId: OpsActionId, params: OpsActionParams): Promise<OpsActionPreviewResult> {
  if (actionId === "ASSUMPTIONS_REFRESH") return previewAssumptionsRefreshAction();
  if (actionId === "RUNS_CLEANUP") return previewCleanupAction(params);
  if (actionId === "REPAIR_INDEX") return previewRepairIndexAction();
  if (actionId === "RUN_MIGRATIONS") return previewRunMigrationsAction();

  return {
    ok: true,
    summary: {
      text: "미리보기 정보가 없습니다.",
    },
  };
}

export async function runOpsAction(actionId: OpsActionId, params: OpsActionParams): Promise<OpsActionRunResult> {
  if (actionId === "ASSUMPTIONS_REFRESH") return runAssumptionsRefreshAction();
  if (actionId === "RUNS_CLEANUP") return runCleanupAction(params);
  if (actionId === "REPAIR_INDEX") return runRepairIndexAction();
  if (actionId === "RUN_MIGRATIONS") return runMigrationsAction();

  return {
    ok: false,
    message: "지원하지 않는 actionId 입니다.",
  };
}
