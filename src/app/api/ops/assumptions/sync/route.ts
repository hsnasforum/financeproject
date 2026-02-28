import { NextResponse } from "next/server";
import { append as appendAuditLog } from "../../../../../lib/audit/auditLogStore";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { buildAssumptionsSnapshot } from "../../../../../lib/planning/assumptions/sync";
import { type AssumptionsSnapshot } from "../../../../../lib/planning/assumptions/types";

type SyncBody = {
  csrf?: unknown;
} | null;

type SyncSummary = {
  snapshotId: string;
  asOf: string;
  fetchedAt: string;
  korea: AssumptionsSnapshot["korea"];
  warningsCount: number;
  sourcesCount: number;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toSummary(input: { snapshotId: string; snapshot: AssumptionsSnapshot }): SyncSummary {
  return {
    snapshotId: input.snapshotId,
    asOf: input.snapshot.asOf,
    fetchedAt: input.snapshot.fetchedAt,
    korea: input.snapshot.korea,
    warningsCount: input.snapshot.warnings.length,
    sourcesCount: input.snapshot.sources.length,
  };
}

function appendSyncAudit(input: {
  result: "SUCCESS" | "ERROR";
  message: string;
  summary?: SyncSummary;
}) {
  try {
    appendAuditLog({
      event: "ASSUMPTIONS_SYNC",
      route: "/api/ops/assumptions/sync",
      summary: `ASSUMPTIONS_SYNC ${input.result}: ${input.message}`,
      details: {
        result: input.result,
        message: input.message,
        snapshotId: input.summary?.snapshotId ?? null,
        asOf: input.summary?.asOf ?? null,
        fetchedAt: input.summary?.fetchedAt ?? null,
        warningsCount: input.summary?.warningsCount ?? null,
        sourcesCount: input.summary?.sourcesCount ?? null,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append assumptions sync log", error);
  }
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: SyncBody = null;
  try {
    body = (await request.json()) as SyncBody;
  } catch {
    body = null;
  }

  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    assertCsrf(request, body);
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return NextResponse.json(
        {
          ok: false,
          message: "요청 검증 중 오류가 발생했습니다.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        message: guard.message,
      },
      { status: guard.status },
    );
  }

  try {
    const built = await buildAssumptionsSnapshot();
    const snapshotSummary = toSummary(built);
    const message = snapshotSummary.warningsCount > 0
      ? "가정 스냅샷을 저장했지만 일부 경고가 있습니다."
      : "가정 스냅샷을 저장했습니다.";

    appendSyncAudit({
      result: "SUCCESS",
      message,
      summary: snapshotSummary,
    });

    return NextResponse.json({
      ok: true,
      snapshotSummary,
      message,
    });
  } catch (error) {
    const message = asString(error instanceof Error ? error.message : "") || "가정 스냅샷 동기화에 실패했습니다.";
    appendSyncAudit({
      result: "ERROR",
      message,
    });

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 },
    );
  }
}
