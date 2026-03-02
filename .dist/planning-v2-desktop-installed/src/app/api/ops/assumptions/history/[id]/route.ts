import { NextResponse } from "next/server";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { loadAssumptionsSnapshotById } from "@/lib/planning/assumptions/storage";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
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
      return NextResponse.json({ ok: false, message: "요청 검증 중 오류가 발생했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: false, message: guard.message }, { status: guard.status });
  }

  const params = await context.params;
  const id = asString(params.id);
  if (!id) {
    return NextResponse.json({ ok: false, message: "snapshot id가 필요합니다." }, { status: 400 });
  }

  try {
    const snapshot = await loadAssumptionsSnapshotById(id);
    if (!snapshot) {
      return NextResponse.json({
        ok: false,
        message: "요청한 스냅샷을 찾을 수 없습니다.",
      });
    }

    return NextResponse.json({
      ok: true,
      snapshotId: id,
      snapshot,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "스냅샷 상세 조회에 실패했습니다.",
      },
      { status: 500 },
    );
  }
}
