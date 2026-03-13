import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { opsErrorResponse } from "@/lib/ops/errorContract";
import { summarize } from "@/lib/ops/metrics/metricsStore";
import { getPlanningFallbackUsageSnapshot } from "@/lib/planning/engine";
import { summarizeLegacyRunBackfill } from "@/lib/planning/store/runStore";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseRange(value: unknown): 24 | 168 {
  const normalized = asString(value).toLowerCase();
  if (normalized === "7d") return 168;
  return 24;
}

function guardReadRequest(request: Request): NextResponse | null {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
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

  const guard = guardReadRequest(request);
  if (guard) return guard;

  const { searchParams } = new URL(request.url);
  const rangeHours = parseRange(searchParams.get("range"));

  try {
    const [last24h, last7d, legacyRunBackfill] = await Promise.all([
      summarize({ rangeHours: 24 }),
      summarize({ rangeHours: 168 }),
      summarizeLegacyRunBackfill(),
    ]);
    const fallbackSnapshot = getPlanningFallbackUsageSnapshot();
    const planningFallbacks = {
      engineEnvelopeFallbackCount: fallbackSnapshot.legacyEnvelopeFallbackCount,
      reportContractFallbackCount: fallbackSnapshot.legacyReportContractFallbackCount,
      runEngineMigrationCount: fallbackSnapshot.legacyRunEngineMigrationCount,
      ...(fallbackSnapshot.lastEventAt ? { lastEventAt: fallbackSnapshot.lastEventAt } : {}),
      ...(fallbackSnapshot.sourceBreakdown ? { sourceBreakdown: fallbackSnapshot.sourceBreakdown } : {}),
      ...(fallbackSnapshot.recentEvents?.length ? { recentEvents: fallbackSnapshot.recentEvents } : {}),
    };
    const requested = rangeHours === 168 ? last7d : last24h;

    return NextResponse.json({
      ok: true,
      data: {
        requested,
        last24h,
        last7d,
        planningFallbacks,
        legacyRunBackfill,
      },
      meta: {
        range: rangeHours === 168 ? "7d" : "24h",
      },
    });
  } catch (error) {
    return opsErrorResponse({
      code: "STORAGE_CORRUPT",
      message: error instanceof Error ? error.message : "metrics 요약을 불러오지 못했습니다.",
      status: 500,
    });
  }
}
