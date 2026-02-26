import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../lib/dev/onlyDev";

const DEV_ACTION_COOKIE_NAME = "dev_action";
const DEV_ACTION_COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60;

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  try {
    assertLocalHost(request);
    assertSameOrigin(request);

    const expectedToken = (process.env.DEV_ACTION_TOKEN ?? "").trim();
    const providedToken = (request.headers.get("x-dev-token") ?? "").trim();

    if (!expectedToken) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "TOKEN_NOT_CONFIGURED", message: "DEV_ACTION_TOKEN 환경 변수가 설정되지 않았습니다." },
        },
        { status: 403 },
      );
    }

    if (!providedToken || providedToken !== expectedToken) {
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
    return response;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "INTERNAL", message: "잠금 해제 처리 중 오류가 발생했습니다." },
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
}
