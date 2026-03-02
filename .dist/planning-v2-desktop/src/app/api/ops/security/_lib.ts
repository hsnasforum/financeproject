import { NextResponse } from "next/server";
import { assertLocalHost, assertSameOrigin, toGuardErrorResponse } from "../../../../lib/dev/devGuards";
import { opsErrorResponse } from "../../../../lib/ops/errorContract";
import { ensureVaultCsrfCookie } from "../../../../lib/planning/security/vaultCsrf";

export function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function withVaultCsrf(request: Request, response: NextResponse): NextResponse {
  return ensureVaultCsrfCookie(request, response);
}

export function guardLocalRequest(request: Request): NextResponse | null {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return opsErrorResponse({
        code: "INTERNAL",
        message: "요청 검증 중 오류가 발생했습니다.",
        status: 500,
      });
    }
    return opsErrorResponse({
      code: guard.code,
      message: guard.message,
      status: guard.status,
    });
  }
}
