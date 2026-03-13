import {
  findAssumptionsSnapshotId,
  listAssumptionsHistory,
  loadAssumptionsSnapshotById,
  loadLatestAssumptionsSnapshot,
} from "../../../../../../lib/planning/assumptions/storage";
import {
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../../lib/dev/devGuards";
import { jsonError, jsonOk } from "../../../../../../lib/planning/api/response";

type SnapshotItem = {
  id: string;
  asOf?: string;
  fetchedAt?: string;
  staleDays?: number;
  warningsCount?: number;
  korea?: {
    policyRatePct?: number;
    cpiYoYPct?: number;
    newDepositAvgPct?: number;
  };
};

type LatestSnapshotItem = SnapshotItem & {
  warningsCount: number;
  sourcesCount: number;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toSafeLimit(value: string): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(1, Math.min(100, parsed));
}

function toUtcDayMs(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function computeStaleDays(fetchedAt: string | undefined, now: Date): number | undefined {
  if (!fetchedAt) return undefined;
  const parsed = new Date(fetchedAt);
  if (Number.isNaN(parsed.getTime())) return undefined;
  const diff = Math.floor((toUtcDayMs(now) - toUtcDayMs(parsed)) / 86_400_000);
  return Math.max(0, diff);
}

function buildKoreaSummary(value: {
  policyRatePct?: number;
  cpiYoYPct?: number;
  newDepositAvgPct?: number;
}): SnapshotItem["korea"] | undefined {
  const korea = {
    ...(typeof value.policyRatePct === "number" ? { policyRatePct: value.policyRatePct } : {}),
    ...(typeof value.cpiYoYPct === "number" ? { cpiYoYPct: value.cpiYoYPct } : {}),
    ...(typeof value.newDepositAvgPct === "number" ? { newDepositAvgPct: value.newDepositAvgPct } : {}),
  };
  return Object.keys(korea).length > 0 ? korea : undefined;
}

function withReadGuard(request: Request) {
  try {
    assertSameOrigin(request);
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) return jsonError("INTERNAL", "요청 검증 중 오류가 발생했습니다.");
    return jsonError(guard.code, guard.message, { status: guard.status });
  }
}

export async function GET(request: Request) {
  const guardFailure = withReadGuard(request);
  if (guardFailure) return guardFailure;

  const { searchParams } = new URL(request.url);
  const limit = toSafeLimit(asString(searchParams.get("limit")));
  const now = new Date();

  try {
    const refs = await listAssumptionsHistory(limit);
    const items: SnapshotItem[] = [];

    for (const ref of refs) {
      const snapshot = await loadAssumptionsSnapshotById(ref.id);
      if (!snapshot) continue;
      const staleDays = computeStaleDays(snapshot.fetchedAt, now);
      items.push({
        id: ref.id,
        ...(snapshot.asOf ? { asOf: snapshot.asOf } : {}),
        ...(snapshot.fetchedAt ? { fetchedAt: snapshot.fetchedAt } : {}),
        ...(typeof staleDays === "number" ? { staleDays } : {}),
        warningsCount: Array.isArray(snapshot.warnings) ? snapshot.warnings.length : 0,
        ...(buildKoreaSummary(snapshot.korea) ? { korea: buildKoreaSummary(snapshot.korea) } : {}),
      });
    }

    items.sort((a, b) => {
      const aTs = Date.parse(asString(a.fetchedAt));
      const bTs = Date.parse(asString(b.fetchedAt));
      if (Number.isFinite(aTs) && Number.isFinite(bTs) && bTs !== aTs) return bTs - aTs;
      return b.id.localeCompare(a.id);
    });

    const latestSnapshot = await loadLatestAssumptionsSnapshot();
    let latest: LatestSnapshotItem | undefined;
    if (latestSnapshot) {
      const latestId = await findAssumptionsSnapshotId(latestSnapshot);
      const staleDays = computeStaleDays(latestSnapshot.fetchedAt, now);
      latest = {
        id: latestId ?? "latest",
        ...(latestSnapshot.asOf ? { asOf: latestSnapshot.asOf } : {}),
        ...(latestSnapshot.fetchedAt ? { fetchedAt: latestSnapshot.fetchedAt } : {}),
        ...(typeof staleDays === "number" ? { staleDays } : {}),
        ...(buildKoreaSummary(latestSnapshot.korea) ? { korea: buildKoreaSummary(latestSnapshot.korea) } : {}),
        warningsCount: Array.isArray(latestSnapshot.warnings) ? latestSnapshot.warnings.length : 0,
        sourcesCount: Array.isArray(latestSnapshot.sources) ? latestSnapshot.sources.length : 0,
      };
    }

    return jsonOk({
      ...(latest ? { latest } : {}),
      items,
    });
  } catch (error) {
    return jsonError(
      "INTERNAL",
      error instanceof Error ? error.message : "스냅샷 목록 조회에 실패했습니다.",
      { status: 500 },
    );
  }
}
