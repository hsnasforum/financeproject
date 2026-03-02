import { NextResponse } from "next/server";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { analyzeFixFailure } from "../../../../../lib/diagnostics/fixFailureAnalyzer";
import { appendFixHistory } from "../../../../../lib/diagnostics/fixHistoryStore";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { isAllowedFixId, runAllowedFix } from "../../../../../lib/dev/runScript";
import { createOrAppendOpsTicket, resolveOpsTicketsOnSuccess } from "../../../../../lib/ops/autoTicket";

type FixBody = {
  fixId?: unknown;
  csrf?: unknown;
} | null;

function statusFromErrorCode(code: string | undefined): number {
  if (!code) return 500;
  if (code === "NOT_ALLOWED") return 400;
  if (code === "TIMEOUT") return 504;
  return 500;
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: FixBody = null;
  try {
    body = (await request.json()) as FixBody;
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

  const fixId = typeof body?.fixId === "string" ? body.fixId.trim() : "";
  if (!fixId) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_FIX_ID", message: "fixId를 입력하세요." } },
      { status: 400 },
    );
  }
  if (!isAllowedFixId(fixId)) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_FIX_ID", message: `허용되지 않은 fixId 입니다: ${fixId}` } },
      { status: 400 },
    );
  }

  const result = await runAllowedFix(fixId);
  const shouldAnalyze = !result.ok || result.stderrTail.trim().length > 0;
  const analysis = shouldAnalyze
    ? analyzeFixFailure({
      fixId,
      stdoutTail: result.stdoutTail,
      stderrTail: result.stderrTail,
    })
    : undefined;
  const history = appendFixHistory({
    fixId,
    ok: result.ok,
    tookMs: result.tookMs,
    stdoutTail: result.stdoutTail,
    stderrTail: result.stderrTail,
    errorCode: result.error?.code ?? null,
    errorMessage: result.error?.message ?? null,
    analysis,
  });
  if (result.ok) {
    try {
      resolveOpsTicketsOnSuccess({
        type: "FIX",
        id: fixId,
        summary: "Fix 실행이 성공적으로 완료되었습니다.",
        historyId: history.id,
        tookMs: result.tookMs,
      });
    } catch (resolveError) {
      console.error("[ops-auto-ticket] failed to resolve fix ticket", resolveError);
    }
    return NextResponse.json({
      ok: true,
      fixId,
      historyId: history.id,
      tookMs: result.tookMs,
      stdoutTail: result.stdoutTail,
      stderrTail: result.stderrTail,
      analysis,
    });
  }

  try {
    createOrAppendOpsTicket({
      type: "FIX",
      id: fixId,
      cause: analysis?.cause ?? result.error?.code ?? "UNKNOWN",
      summary: analysis?.summary ?? result.error?.message ?? "Fix 실행에 실패했습니다.",
      stderrTail: result.stderrTail,
      stdoutTail: result.stdoutTail,
      suggestedFixIds: analysis?.suggestedFixIds,
      tookMs: result.tookMs,
    });
  } catch (ticketError) {
    console.error("[ops-auto-ticket] failed to create/append fix ticket", ticketError);
  }

  return NextResponse.json(
    {
      ok: false,
      fixId,
      historyId: history.id,
      tookMs: result.tookMs,
      error: result.error ?? { code: "INTERNAL", message: "Fix 실행에 실패했습니다." },
      stdoutTail: result.stdoutTail,
      stderrTail: result.stderrTail,
      analysis,
    },
    { status: statusFromErrorCode(result.error?.code) },
  );
}
