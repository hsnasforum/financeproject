import { NextResponse } from "next/server";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { findAssumptionsSnapshotId, loadLatestAssumptionsSnapshot } from "../../../../../lib/planning/assumptions/storage";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const csrf = asString(searchParams.get("csrf"));

  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    assertCsrf(request, { csrf });
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
    const snapshot = await loadLatestAssumptionsSnapshot();
    if (!snapshot) {
      return NextResponse.json({
        ok: false,
        message: "저장된 가정 스냅샷이 없습니다.",
      });
    }

    return NextResponse.json({
      ok: true,
      snapshot,
      snapshotId: await findAssumptionsSnapshotId(snapshot),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "가정 스냅샷 조회에 실패했습니다.",
      },
      { status: 500 },
    );
  }
}
