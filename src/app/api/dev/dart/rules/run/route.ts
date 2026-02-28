import { NextResponse } from "next/server";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../../lib/dev/onlyDev";
import { isAllowedRuleAction, runAllowedRuleAction } from "../../../../../../lib/dev/runScript";

const RULE_ACTION_TIMEOUT_MS = 10 * 60 * 1000;

type RulesRunBody = {
  action?: unknown;
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

  let body: RulesRunBody = null;
  try {
    body = (await request.json()) as RulesRunBody;
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

  const action = typeof body?.action === "string" ? body.action.trim() : "";
  if (!action || !isAllowedRuleAction(action)) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "INVALID_ACTION", message: "허용되지 않은 action 입니다." },
      },
      { status: 400 },
    );
  }

  const result = await runAllowedRuleAction(action, { timeoutMs: RULE_ACTION_TIMEOUT_MS });
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
      stdoutTail: result.stdoutTail,
      stderrTail: result.stderrTail,
      error: result.error ?? { code: "INTERNAL", message: "규칙 실행에 실패했습니다." },
    },
    { status: statusFromErrorCode(result.error?.code) },
  );
}
