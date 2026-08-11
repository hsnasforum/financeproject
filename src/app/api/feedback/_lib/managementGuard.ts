import { NextResponse } from "next/server";
import { isLocalRequest } from "@/lib/dev/localRequest";
import { isProductionEnv } from "@/lib/dev/onlyDev";
import { hasFeedbackManagementCapability } from "@/lib/feedback/feedbackManagementCapability";

function errorResponse(status: number, code: string, message: string): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: { code, message },
    },
    { status },
  );
}

export function guardFeedbackManagementAccess(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): NextResponse | null {
  if (isProductionEnv(env)) {
    return errorResponse(404, "NOT_FOUND", "Not found");
  }

  if ((request.headers.get("x-forwarded-host") ?? "").trim()) {
    return errorResponse(
      403,
      "LOCAL_ONLY",
      "피드백 관리 기능은 전달 host를 신뢰하지 않는 로컬 직접 연결에서만 사용할 수 있습니다.",
    );
  }

  const strictLocalEnv = { ...env, ALLOW_REMOTE: "" };
  if (!isLocalRequest(request, strictLocalEnv)) {
    return errorResponse(403, "LOCAL_ONLY", "피드백 관리 기능은 로컬 환경에서만 사용할 수 있습니다.");
  }

  if (!hasFeedbackManagementCapability(request, env)) {
    return errorResponse(
      403,
      "UNAUTHORIZED",
      "Dev unlock을 완료한 로컬 운영자만 피드백 관리 기능을 사용할 수 있습니다.",
    );
  }

  return null;
}
