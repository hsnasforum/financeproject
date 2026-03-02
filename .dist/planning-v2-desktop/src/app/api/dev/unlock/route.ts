import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { append as appendAuditLog } from "../../../../lib/audit/auditLogStore";
import {
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../lib/dev/onlyDev";

const DEV_ACTION_COOKIE_NAME = "dev_action";
const DEV_ACTION_COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60;

function auditUnlock(summary: string, details: Record<string, unknown>): void {
  try {
    appendAuditLog({
      event: "DEV_UNLOCK",
      route: "/api/dev/unlock",
      summary,
      details,
    });
  } catch (error) {
    console.error("[audit] failed to append dev unlock log", error);
  }
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  try {
    assertLocalHost(request);
    assertSameOrigin(request);

    const expectedToken = (process.env.DEV_ACTION_TOKEN ?? "").trim();
    const providedToken = (request.headers.get("x-dev-token") ?? "").trim();

    if (!expectedToken) {
      auditUnlock("Dev unlock 실패: TOKEN_NOT_CONFIGURED", {
        ok: false,
        code: "TOKEN_NOT_CONFIGURED",
        hasProvidedToken: providedToken.length > 0,
      });
      return NextResponse.json(
        {
          ok: false,
          error: { code: "TOKEN_NOT_CONFIGURED", message: "DEV_ACTION_TOKEN 환경 변수가 설정되지 않았습니다." },
        },
        { status: 403 },
      );
    }

    if (!providedToken || providedToken !== expectedToken) {
      auditUnlock("Dev unlock 실패: UNAUTHORIZED", {
        ok: false,
        code: "UNAUTHORIZED",
        hasProvidedToken: providedToken.length > 0,
      });
      return NextResponse.json(
        {
          ok: false,
          error: { code: "UNAUTHORIZED", message: "잠금 해제 토큰이 올바르지 않습니다." },
        },
        { status: 403 },
      );
    }

    const csrfToken = randomBytes(24).toString("base64url");
    const response = NextResponse.json({ ok: true, csrf: csrfToken });
    response.cookies.set({
      name: DEV_ACTION_COOKIE_NAME,
      value: "1",
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: DEV_ACTION_COOKIE_MAX_AGE_SECONDS,
    });
    response.cookies.set({
      name: "dev_csrf",
      value: csrfToken,
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: DEV_ACTION_COOKIE_MAX_AGE_SECONDS,
    });
    auditUnlock("Dev unlock 성공", {
      ok: true,
    });
    return response;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      auditUnlock("Dev unlock 실패: INTERNAL", {
        ok: false,
        code: "INTERNAL",
      });
      return NextResponse.json(
        {
          ok: false,
          error: { code: "INTERNAL", message: "잠금 해제 처리 중 오류가 발생했습니다." },
        },
        { status: 500 },
      );
    }
    auditUnlock(`Dev unlock 실패: ${guard.code}`, {
      ok: false,
      code: guard.code,
    });
    return NextResponse.json(
      {
        ok: false,
        error: { code: guard.code, message: guard.message },
      },
      { status: guard.status },
    );
  }
}
