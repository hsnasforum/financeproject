import { NextResponse } from "next/server";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../../lib/dev/onlyDev";
import { runAllowedFix } from "../../../../../../lib/dev/runScript";
import { analyzeFixFailure } from "../../../../../../lib/diagnostics/fixFailureAnalyzer";
import { FIX_CHAIN_DEFS, isChainId } from "../../../../../../lib/diagnostics/fixChains";
import { appendFixHistory, type FixHistoryStep } from "../../../../../../lib/diagnostics/fixHistoryStore";
import { createOrAppendOpsTicket, resolveOpsTicketsOnSuccess } from "../../../../../../lib/ops/autoTicket";

type ChainBody = {
  chainId?: unknown;
  csrf?: unknown;
  dryRun?: unknown;
  confirmText?: unknown;
} | null;

function statusFromErrorCode(code: string | undefined): number {
  if (!code) return 500;
  if (code === "NOT_ALLOWED") return 400;
  if (code === "TIMEOUT") return 504;
  return 500;
}

function toTail(input: string, chunk: string, max = 2000): string {
  const joined = `${input}${chunk}`;
  if (joined.length <= max) return joined;
  return joined.slice(joined.length - max);
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: ChainBody = null;
  try {
    body = (await request.json()) as ChainBody;
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

  const chainIdRaw = typeof body?.chainId === "string" ? body.chainId.trim() : "";
  if (!chainIdRaw || !isChainId(chainIdRaw)) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_CHAIN_ID", message: "허용되지 않은 chainId 입니다." } },
      { status: 400 },
    );
  }

  const chain = FIX_CHAIN_DEFS[chainIdRaw];
  const dryRun = body?.dryRun === true;
  const confirmText = typeof body?.confirmText === "string" ? body.confirmText.trim() : "";
  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      chain: {
        chainId: chainIdRaw,
        title: chain.title,
        risk: chain.risk,
        steps: [...chain.steps],
        impact: [...chain.impact],
      },
    });
  }

  if (chain.risk === "HIGH") {
    const expected = `RUN ${chainIdRaw}`;
    if (confirmText !== expected) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "CONFIRM_REQUIRED",
            message: `고위험 체인 실행 전 확인 문구를 정확히 입력해 주세요: ${expected}`,
          },
        },
        { status: 400 },
      );
    }
  }

  const fixIds = chain.steps;
  const steps: FixHistoryStep[] = [];
  let failedCode: string | undefined;
  let failedMessage: string | undefined;
  let failedAnalysis: ReturnType<typeof analyzeFixFailure> | undefined;
  let stdoutTail = "";
  let stderrTail = "";
  let totalMs = 0;

  for (const fixId of fixIds) {
    const result = await runAllowedFix(fixId);
    totalMs += result.tookMs;
    stdoutTail = toTail(stdoutTail, `\n[${fixId}]\n${result.stdoutTail}`.trim());
    stderrTail = toTail(stderrTail, `\n[${fixId}]\n${result.stderrTail}`.trim());

    const shouldAnalyze = !result.ok || result.stderrTail.trim().length > 0;
    const analysis = shouldAnalyze
      ? analyzeFixFailure({
        fixId,
        stdoutTail: result.stdoutTail,
        stderrTail: result.stderrTail,
      })
      : undefined;

    steps.push({
      fixId,
      ok: result.ok,
      tookMs: result.tookMs,
      stdoutTail: result.stdoutTail,
      stderrTail: result.stderrTail,
      errorCode: result.error?.code ?? null,
      errorMessage: result.error?.message ?? null,
      analysis,
    });

    if (!result.ok) {
      failedCode = result.error?.code;
      failedMessage = result.error?.message;
      failedAnalysis = analysis;
      break;
    }
  }

  const ok = failedCode === undefined;
  const history = appendFixHistory({
    fixId: `CHAIN:${chainIdRaw}`,
    ok,
    tookMs: totalMs,
    stdoutTail,
    stderrTail,
    errorCode: failedCode ?? null,
    errorMessage: failedMessage ?? null,
    chainId: chainIdRaw,
    steps,
    analysis: failedAnalysis,
  });

  const payload = {
    ok,
    chainId: chainIdRaw,
    historyId: history.id,
    steps: steps.map((step) => ({
      fixId: step.fixId,
      ok: step.ok,
      tookMs: step.tookMs,
      stdoutTail: step.stdoutTail,
      stderrTail: step.stderrTail,
      errorCode: step.errorCode,
      errorMessage: step.errorMessage,
      analysis: step.analysis,
    })),
    error: ok ? undefined : { code: failedCode ?? "INTERNAL", message: failedMessage ?? "체인 실행에 실패했습니다." },
  };

  if (!ok) {
    try {
      createOrAppendOpsTicket({
        type: "CHAIN",
        id: chainIdRaw,
        cause: failedAnalysis?.cause ?? failedCode ?? "UNKNOWN",
        summary: failedAnalysis?.summary ?? failedMessage ?? "체인 실행에 실패했습니다.",
        stderrTail,
        stdoutTail,
        suggestedFixIds: failedAnalysis?.suggestedFixIds,
        tookMs: totalMs,
      });
    } catch (ticketError) {
      console.error("[ops-auto-ticket] failed to create/append chain ticket", ticketError);
    }
  }

  if (ok) {
    try {
      resolveOpsTicketsOnSuccess({
        type: "CHAIN",
        id: chainIdRaw,
        summary: "체인 실행이 성공적으로 완료되었습니다.",
        historyId: history.id,
        tookMs: totalMs,
      });
    } catch (resolveError) {
      console.error("[ops-auto-ticket] failed to resolve chain ticket", resolveError);
    }
    return NextResponse.json(payload);
  }
  return NextResponse.json(payload, { status: statusFromErrorCode(failedCode) });
}
