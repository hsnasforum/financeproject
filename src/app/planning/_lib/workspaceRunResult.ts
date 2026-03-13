import { resolveReportResultDtoFromRun } from "@/lib/planning/reports/reportInputContract";
import { type PlanningRunRecord } from "@/lib/planning/store/types";
import {
  parseProfileNormalizationDisclosure,
  type ProfileNormalizationDisclosure,
} from "@/lib/planning/v2/normalizationDisclosure";
import { type ResultDtoV1 } from "@/lib/planning/v2/resultDto";
import {
  assumptionsHealthMessage,
  type AssumptionsHealthWarningCode,
} from "@/lib/planning/v2/warningsCatalog.ko";
import { resolveWarningCatalog } from "@/lib/planning/catalog/warningCatalog";
import { type SnapshotListItem } from "./snapshotList";
import {
  createInitialStepStatuses,
  type StepId,
  type StepStatus,
} from "./runPipeline";

export type WorkspaceHealthWarning = {
  code: string;
  severity: "info" | "warn" | "critical";
  message: string;
  data?: Record<string, unknown>;
};

export type WorkspaceHealthSummary = {
  warningsCount: number;
  criticalCount: number;
  warningCodes: string[];
  snapshotStaleDays?: number;
  flags?: {
    snapshotMissing?: boolean;
    snapshotStaleDays?: number;
    optimisticReturn?: boolean;
    riskMismatch?: boolean;
  };
};

export type WorkspaceRunMeta = {
  generatedAt?: string;
  snapshot?: {
    id?: string;
    asOf?: string;
    fetchedAt?: string;
    missing?: boolean;
    warningsCount?: number;
    sourcesCount?: number;
  };
  health?: WorkspaceHealthSummary;
  cache?: {
    hit?: boolean;
    keyPrefix?: string;
  };
  normalization?: ProfileNormalizationDisclosure;
};

export type WorkspaceRunResult = {
  meta?: WorkspaceRunMeta;
  resultDto: ResultDtoV1;
  hasSimulateResult: boolean;
  healthWarnings: WorkspaceHealthWarning[];
  stepStatuses: StepStatus[];
};

export type WorkspaceCompletedRunState = {
  runResult: WorkspaceRunResult;
  stepStatuses: StepStatus[];
  notices: string[];
};

export type WorkspaceHealthGuardState = {
  summary: WorkspaceHealthSummary | null;
  warnings: WorkspaceHealthWarning[];
  hasCriticalHealth: boolean;
  saveBlockedByHealth: boolean;
  disabledReason: string;
};

export type WorkspaceSnapshotState = {
  feedbackContext: {
    id?: string;
    asOf?: string;
    fetchedAt?: string;
    missing?: boolean;
  };
  outcomesMeta: {
    missing?: boolean;
    staleDays?: number;
  };
  displayId: string;
};

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function buildSummaryOnlyHealthWarning(
  code: string,
  summary: WorkspaceHealthSummary | null,
): WorkspaceHealthWarning {
  const normalizedCode = asString(code).toUpperCase();
  const data = typeof summary?.snapshotStaleDays === "number"
    ? { days: summary.snapshotStaleDays }
    : undefined;
  const message = (
    normalizedCode === "SNAPSHOT_MISSING"
    || normalizedCode === "SNAPSHOT_STALE"
    || normalizedCode === "SNAPSHOT_VERY_STALE"
    || normalizedCode === "OPTIMISTIC_RETURN"
    || normalizedCode === "OPTIMISTIC_RETURN_HIGH"
    || normalizedCode === "RISK_ASSUMPTION_MISMATCH"
    || normalizedCode === "RISK_ASSUMPTION_MISMATCH_LOW"
  )
    ? assumptionsHealthMessage(normalizedCode as AssumptionsHealthWarningCode, data)
    : resolveWarningCatalog(normalizedCode).plainDescription;
  const severity = resolveWarningCatalog(normalizedCode).severityHint;

  return {
    code: normalizedCode,
    severity,
    message,
    ...(data ? { data } : {}),
  };
}

function mergeHealthWarnings(
  summary: WorkspaceHealthSummary | null,
  warnings: WorkspaceHealthWarning[],
): WorkspaceHealthWarning[] {
  const merged = new Map<string, WorkspaceHealthWarning>();

  for (const warning of warnings) {
    merged.set(warning.code, warning);
  }

  for (const code of summary?.warningCodes ?? []) {
    const normalizedCode = asString(code).toUpperCase();
    if (!normalizedCode || merged.has(normalizedCode)) continue;
    merged.set(normalizedCode, buildSummaryOnlyHealthWarning(normalizedCode, summary));
  }

  return [...merged.values()];
}

function buildWorkspaceHealthSummary(value: unknown): WorkspaceHealthSummary | undefined {
  const row = asRecord(value);
  if (Object.keys(row).length < 1) return undefined;

  const warningCodes = [
    ...asArray(row.warningCodes),
    ...asArray(row.warningsCodes),
  ]
    .map((entry) => asString(entry))
    .filter((entry, index, items) => entry.length > 0 && items.indexOf(entry) === index);
  const criticalCount = Math.max(0, Math.trunc(asNumber(row.criticalCount) ?? 0));
  const warningsCount = Math.max(
    warningCodes.length,
    Math.trunc(asNumber(row.warningsCount) ?? warningCodes.length),
  );
  const snapshotStaleDays = asNumber(row.snapshotStaleDays);
  const flagsRow = asRecord(row.flags);
  const flags = {
    ...(typeof flagsRow.snapshotMissing === "boolean" ? { snapshotMissing: flagsRow.snapshotMissing } : {}),
    ...(typeof flagsRow.snapshotStaleDays === "number" ? { snapshotStaleDays: flagsRow.snapshotStaleDays } : {}),
    ...(typeof flagsRow.optimisticReturn === "boolean" ? { optimisticReturn: flagsRow.optimisticReturn } : {}),
    ...(typeof flagsRow.riskMismatch === "boolean" ? { riskMismatch: flagsRow.riskMismatch } : {}),
  };

  return {
    warningsCount,
    criticalCount,
    warningCodes,
    ...(typeof snapshotStaleDays === "number" ? { snapshotStaleDays: Math.max(0, Math.trunc(snapshotStaleDays)) } : {}),
    ...(Object.keys(flags).length > 0 ? { flags } : {}),
  };
}

export function buildStepStatusesFromRunStages(stages: PlanningRunRecord["stages"]): StepStatus[] {
  if (!Array.isArray(stages) || stages.length < 1) return createInitialStepStatuses();

  const normalized = stages.map((stage) => {
    const normalizedId = (stage.id === "debt" ? "debtStrategy" : stage.id) as StepId;
    const startedAt = stage.startedAt ? Date.parse(stage.startedAt) : Number.NaN;
    const endedAt = stage.endedAt ? Date.parse(stage.endedAt) : Number.NaN;
    const reason = asString(stage.reason);
    const errorSummary = asString(stage.errorSummary);
    const message = [reason, errorSummary]
      .filter((item, index, items) => item && items.indexOf(item) === index)
      .join(" · ");

    return {
      id: normalizedId,
      state: stage.status,
      ...(message ? { message } : {}),
      ...(Number.isFinite(startedAt) ? { startedAt } : {}),
      ...(Number.isFinite(endedAt) ? { endedAt } : {}),
    } satisfies StepStatus;
  });

  const byId = new Map<StepId, StepStatus>();
  for (const row of normalized) {
    byId.set(row.id, row);
  }
  return createInitialStepStatuses().map((row) => byId.get(row.id) ?? row);
}

export function buildWorkspaceRunResultFromRecord(run: PlanningRunRecord): WorkspaceRunResult {
  const outputs = asRecord(run.outputs);
  const simulate = asRecord(outputs.simulate);
  const normalization = parseProfileNormalizationDisclosure(run.meta.normalization);
  const resultDto = resolveReportResultDtoFromRun(run);
  const health = buildWorkspaceHealthSummary(run.meta.health);

  return {
    meta: {
      generatedAt: run.createdAt,
      snapshot: run.meta.snapshot,
      ...(normalization ? { normalization } : {}),
      ...(health ? { health } : {}),
    },
    resultDto,
    hasSimulateResult: Object.keys(simulate).length > 0,
    healthWarnings: asArray(simulate.healthWarnings).map((entry) => asRecord(entry) as WorkspaceHealthWarning),
    stepStatuses: buildStepStatusesFromRunStages(run.stages),
  };
}

function buildCompletionNotices(
  overallStatus: PlanningRunRecord["overallStatus"],
  stepStatuses: StepStatus[],
): string[] {
  const statusById = new Map(stepStatuses.map((row) => [row.id, row]));
  const notices: string[] = [];

  if (statusById.get("scenarios")?.state === "FAILED") notices.push("시나리오 계산에 실패했습니다.");
  if (statusById.get("monteCarlo")?.state === "FAILED") notices.push("몬테카를로 계산에 실패했습니다.");
  if (
    statusById.get("monteCarlo")?.state === "SKIPPED"
    && statusById.get("monteCarlo")?.message?.toLowerCase().includes("budget")
  ) {
    notices.push("몬테카를로는 예산 초과로 생략되었습니다.");
  }
  if (statusById.get("actions")?.state === "FAILED") notices.push("실행 계획 생성에 실패했습니다.");
  if (statusById.get("debtStrategy")?.state === "FAILED") notices.push("부채 분석에 실패했습니다.");
  if (overallStatus === "PARTIAL_SUCCESS") notices.push("전체 상태: PARTIAL_SUCCESS");
  if (overallStatus === "FAILED") notices.push("전체 상태: FAILED");

  return notices;
}

export function buildWorkspaceCompletedRunState(run: PlanningRunRecord): WorkspaceCompletedRunState {
  const runResult = buildWorkspaceRunResultFromRecord(run);
  return {
    runResult,
    stepStatuses: runResult.stepStatuses,
    notices: buildCompletionNotices(run.overallStatus, runResult.stepStatuses),
  };
}

export function buildWorkspaceHealthGuardState(input: {
  runResult: WorkspaceRunResult | null;
  healthAck: boolean;
}): WorkspaceHealthGuardState {
  const summary = input.runResult?.meta?.health ?? null;
  const warnings = mergeHealthWarnings(summary, input.runResult?.healthWarnings ?? []);
  const hasCriticalHealth = (summary?.criticalCount ?? 0) > 0;
  const saveBlockedByHealth = hasCriticalHealth && !input.healthAck;
  const warningCodes = new Set([
    ...(summary?.warningCodes ?? []),
    ...warnings.map((warning) => warning.code),
  ]);
  const hasVeryStaleSnapshot = warningCodes.has("SNAPSHOT_VERY_STALE");

  return {
    summary,
    warnings,
    hasCriticalHealth,
    saveBlockedByHealth,
    disabledReason: saveBlockedByHealth
      ? (
        hasVeryStaleSnapshot
          ? "치명 경고 확인이 필요합니다. 스냅샷이 매우 오래되었습니다. /ops/assumptions에서 동기화를 권장합니다."
          : "치명 경고 확인이 필요합니다. 확인 전에는 실행 기록 저장 및 고비용 액션이 제한됩니다."
      )
      : "",
  };
}

export function buildWorkspaceSnapshotState(input: {
  runResult: WorkspaceRunResult | null;
  selectedSnapshot?: SnapshotListItem;
}): WorkspaceSnapshotState {
  const snapshotFromRun = input.runResult?.meta?.snapshot;
  const snapshotFromSelection = input.selectedSnapshot;
  const displayId = asString(snapshotFromRun?.id || snapshotFromSelection?.id);
  const asOf = asString(snapshotFromRun?.asOf || snapshotFromSelection?.asOf);
  const fetchedAt = asString(snapshotFromRun?.fetchedAt || snapshotFromSelection?.fetchedAt);
  const staleDays = input.runResult?.meta?.health?.snapshotStaleDays;

  return {
    feedbackContext: {
      ...(displayId ? { id: displayId } : {}),
      ...(asOf ? { asOf } : {}),
      ...(fetchedAt ? { fetchedAt } : {}),
      ...(typeof snapshotFromRun?.missing === "boolean" ? { missing: snapshotFromRun.missing } : {}),
    },
    outcomesMeta: {
      ...(snapshotFromRun?.missing === true ? { missing: true } : {}),
      ...(typeof staleDays === "number" ? { staleDays } : {}),
    },
    displayId,
  };
}
