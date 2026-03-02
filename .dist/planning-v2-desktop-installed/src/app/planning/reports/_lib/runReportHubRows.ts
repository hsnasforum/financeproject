import {
  buildResultDtoV1FromRunRecord,
  isResultDtoV1,
  type ResultDtoV1,
} from "../../../../lib/planning/v2/resultDto";
import { type PlanningRunRecord } from "../../../../lib/planning/store/types";

export type RunReportHubRow = {
  id: string;
  createdAt: string;
  title: string;
  snapshot: {
    id?: string;
    asOf?: string;
    missing: boolean;
  };
  summary: {
    goalsAchieved: string;
    worstCashKrw?: number;
    dsrPct?: number;
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toResultDto(run: PlanningRunRecord): ResultDtoV1 {
  const outputs = asRecord(run.outputs);
  const rawDto = outputs.resultDto;
  if (isResultDtoV1(rawDto)) return rawDto;
  return buildResultDtoV1FromRunRecord(run);
}

function normalizePct(raw: number | undefined): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  const pct = Math.abs(raw) <= 1 ? raw * 100 : raw;
  return Math.round(pct * 10) / 10;
}

function toGoalsAchieved(dto: ResultDtoV1): string {
  if (dto.summary.goalsAchieved) {
    return `${dto.summary.goalsAchieved.achieved}/${dto.summary.goalsAchieved.total}`;
  }
  if (dto.goals.length === 0) return "-";
  const achieved = dto.goals.filter((goal) => goal.achieved === true).length;
  return `${achieved}/${dto.goals.length}`;
}

export function toRunReportHubRow(run: PlanningRunRecord): RunReportHubRow {
  const dto = toResultDto(run);
  const snapshot = asRecord(run.meta.snapshot);
  const snapshotId = asString(snapshot.id) || asString(dto.meta.snapshot.id) || undefined;
  const snapshotAsOf = asString(snapshot.asOf) || asString(dto.meta.snapshot.asOf) || undefined;
  const dsrRaw = asNumber(dto.summary.dsrPct) ?? asNumber(dto.debt?.dsrPct);
  const dsrPct = normalizePct(dsrRaw);
  const worstCashKrw = asNumber(dto.summary.worstCashKrw);

  return {
    id: run.id,
    createdAt: run.createdAt,
    title: run.title?.trim() ? run.title.trim() : `실행 ${run.id}`,
    snapshot: {
      ...(snapshotId ? { id: snapshotId } : {}),
      ...(snapshotAsOf ? { asOf: snapshotAsOf } : {}),
      missing: snapshot.missing === true || dto.meta.snapshot.missing === true,
    },
    summary: {
      goalsAchieved: toGoalsAchieved(dto),
      ...(typeof worstCashKrw === "number" ? { worstCashKrw } : {}),
      ...(typeof dsrPct === "number" ? { dsrPct } : {}),
    },
  };
}

export function toRunReportHubRows(runs: PlanningRunRecord[]): RunReportHubRow[] {
  return runs.map((run) => toRunReportHubRow(run));
}
