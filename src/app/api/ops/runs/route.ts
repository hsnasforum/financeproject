import { NextResponse } from "next/server";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../lib/dev/onlyDev";
import { opsErrorResponse } from "../../../../lib/ops/errorContract";
import { loadOpsPolicy } from "../../../../lib/ops/opsPolicy";
import { listRunIndexEntries, type RunIndexEntry } from "../../../../lib/planning/server/store/runStore";
import { type PlanningRunOverallStatus } from "../../../../lib/planning/store/types";

type RunSummary = {
  id: string;
  profileId: string;
  title?: string;
  createdAt: string;
  overallStatus?: PlanningRunOverallStatus;
  snapshot?: {
    id?: string;
    asOf?: string;
    missing?: boolean;
  };
  warningsCount?: number;
  criticalCount?: number;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toSafeInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function asStatus(value: unknown): PlanningRunOverallStatus | undefined {
  return value === "RUNNING" || value === "SUCCESS" || value === "PARTIAL_SUCCESS" || value === "FAILED"
    ? value
    : undefined;
}

function includeByRange(row: RunIndexEntry, dateFrom: string, dateTo: string): boolean {
  const rowMs = Date.parse(row.createdAt);
  if (!Number.isFinite(rowMs)) return true;

  if (dateFrom) {
    const fromMs = Date.parse(`${dateFrom}T00:00:00.000Z`);
    if (Number.isFinite(fromMs) && rowMs < fromMs) return false;
  }
  if (dateTo) {
    const toMs = Date.parse(`${dateTo}T23:59:59.999Z`);
    if (Number.isFinite(toMs) && rowMs > toMs) return false;
  }
  return true;
}

function includeByQuery(row: RunIndexEntry, query: string): boolean {
  if (!query) return true;
  const lowered = query.toLowerCase();
  const title = asString(row.title).toLowerCase();
  const snapshotId = asString(row.snapshot?.id).toLowerCase();
  const runId = asString(row.id).toLowerCase();
  return title.includes(lowered) || snapshotId.includes(lowered) || runId.includes(lowered);
}

function toRunSummary(row: RunIndexEntry): RunSummary {
  return {
    id: row.id,
    profileId: row.profileId,
    ...(asString(row.title) ? { title: asString(row.title) } : {}),
    createdAt: row.createdAt,
    ...(row.overallStatus ? { overallStatus: row.overallStatus } : {}),
    snapshot: {
      ...(asString(row.snapshot?.id) ? { id: asString(row.snapshot?.id) } : {}),
      ...(asString(row.snapshot?.asOf) ? { asOf: asString(row.snapshot?.asOf) } : {}),
      ...(row.snapshot?.missing === true ? { missing: true } : {}),
    },
    ...(typeof asNumber(row.warningsCount) === "number" ? { warningsCount: asNumber(row.warningsCount) } : {}),
    ...(typeof asNumber(row.criticalCount) === "number" ? { criticalCount: asNumber(row.criticalCount) } : {}),
  };
}

function guardRequest(request: Request, csrf: string): NextResponse | null {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    assertCsrf(request, { csrf });
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return opsErrorResponse({
        code: "INTERNAL",
        message: "요청 검증 중 오류가 발생했습니다.",
        status: 500,
      });
    }
    return opsErrorResponse({
      code: guard.code,
      message: guard.message,
      status: guard.status,
    });
  }
}

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const policy = loadOpsPolicy();
  const { searchParams } = new URL(request.url);
  const csrf = asString(searchParams.get("csrf"));
  const guard = guardRequest(request, csrf);
  if (guard) return guard;

  const profileId = asString(searchParams.get("profileId"));
  const status = asStatus(searchParams.get("status"));
  const q = asString(searchParams.get("q")).toLowerCase();
  const dateFrom = asString(searchParams.get("dateFrom"));
  const dateTo = asString(searchParams.get("dateTo"));
  const limit = toSafeInt(searchParams.get("limit"), policy.runs.defaultPageSize, 1, policy.runs.maxPageSize);
  const offset = toSafeInt(searchParams.get("offset"), 0, 0, 50000);

  try {
    const rows = await listRunIndexEntries({
      ...(profileId ? { profileId } : {}),
      limit: 50000,
      offset: 0,
    });

    const filtered = rows
      .filter((row) => (status ? row.overallStatus === status : true))
      .filter((row) => includeByRange(row, dateFrom, dateTo))
      .filter((row) => includeByQuery(row, q));

    const total = filtered.length;
    const items = filtered.slice(offset, offset + limit).map((row) => toRunSummary(row));

    return NextResponse.json({
      ok: true,
      data: items,
      meta: {
        total,
        limit,
        offset,
        hasMore: offset + items.length < total,
      },
    });
  } catch (error) {
    return opsErrorResponse({
      code: "INTERNAL",
      message: error instanceof Error ? error.message : "실행 기록 조회에 실패했습니다.",
      status: 500,
    });
  }
}
