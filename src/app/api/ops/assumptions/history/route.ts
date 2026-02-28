import { NextResponse } from "next/server";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../../lib/dev/onlyDev";
import { listAssumptionsHistory, loadAssumptionsSnapshotById } from "../../../../../../lib/planning/assumptions/storage";
import { type AssumptionsSnapshot } from "../../../../../../lib/planning/assumptions/types";

type SnapshotHistorySummary = {
  id: string;
  asOf?: string;
  fetchedAt: string;
  warningsCount: number;
  sourcesCount: number;
  korea: AssumptionsSnapshot["korea"];
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toSafeLimit(value: string): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(1, Math.min(100, parsed));
}

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const csrf = asString(searchParams.get("csrf"));
  const limit = toSafeLimit(asString(searchParams.get("limit")));

  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    assertCsrf(request, { csrf });
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return NextResponse.json({ ok: false, message: "요청 검증 중 오류가 발생했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: false, message: guard.message }, { status: guard.status });
  }

  try {
    const refs = await listAssumptionsHistory(limit);
    const summaries = (await Promise.all(refs.map(async (ref) => {
      const snapshot = await loadAssumptionsSnapshotById(ref.id);
      if (!snapshot) return null;
      const row: SnapshotHistorySummary = {
        id: ref.id,
        ...(snapshot.asOf ? { asOf: snapshot.asOf } : {}),
        fetchedAt: snapshot.fetchedAt,
        warningsCount: snapshot.warnings.length,
        sourcesCount: snapshot.sources.length,
        korea: snapshot.korea,
      };
      return row;
    }))).filter((row): row is SnapshotHistorySummary => Boolean(row));

    return NextResponse.json({
      ok: true,
      items: summaries,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "스냅샷 히스토리 조회에 실패했습니다.",
      },
      { status: 500 },
    );
  }
}
