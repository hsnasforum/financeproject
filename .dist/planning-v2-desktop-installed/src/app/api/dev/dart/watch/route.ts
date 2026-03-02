import { NextResponse } from "next/server";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { runScript } from "@/lib/dev/runScript";
import { onlyDev } from "../../../../../lib/dev/onlyDev";

function statusFromErrorCode(code: string | undefined): number {
  if (!code) return 500;
  if (code === "NOT_ALLOWED") return 400;
  if (code === "TIMEOUT") return 504;
  return 500;
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);

    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    assertCsrf(request, body as { csrf?: unknown } | null);
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

  const result = await runScript({
    command: "pnpm",
    args: ["dart:watch"],
  });

  if (result.ok) {
    return NextResponse.json({
      ok: true,
      tookMs: result.tookMs,
      stdoutTail: result.stdoutTail,
      stderrTail: result.stderrTail,
    });
  }

  return NextResponse.json(
    {
      ok: false,
      tookMs: result.tookMs,
      error: result.error ?? { code: "INTERNAL", message: "스크립트 실행에 실패했습니다." },
      stdoutTail: result.stdoutTail,
      stderrTail: result.stderrTail,
    },
    { status: statusFromErrorCode(result.error?.code) },
  );
}
