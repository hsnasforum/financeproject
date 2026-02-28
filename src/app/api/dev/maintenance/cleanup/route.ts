import { NextResponse } from "next/server";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { runCleanup } from "../../../../../lib/maintenance/cleanup";

type CleanupBody = {
  csrf?: unknown;
} | null;

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: CleanupBody = null;
  try {
    body = (await request.json()) as CleanupBody;
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
          error: { code: "INTERNAL", message: "요청 검증 중 오류가 발생했습니다." },
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: { code: guard.code, message: guard.message },
      },
      { status: guard.status },
    );
  }

  try {
    const result = runCleanup({ now: new Date() });
    return NextResponse.json({
      ok: true,
      report: result.report,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "CLEANUP_FAILED",
          message: error instanceof Error ? error.message : "cleanup 실행 중 오류가 발생했습니다.",
        },
      },
      { status: 500 },
    );
  }
}
