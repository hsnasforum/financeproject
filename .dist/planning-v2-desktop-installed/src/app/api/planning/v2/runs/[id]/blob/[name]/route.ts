import {
  assertLocalHost,
  requireCsrf,
  toGuardErrorResponse,
} from "../../../../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../../../../lib/dev/onlyDev";
import { jsonError, jsonOk } from "../../../../../../../../lib/http/apiResponse";
import { getRunBlob } from "../../../../../../../../lib/planning/server/store/runStore";

type RouteContext = {
  params: Promise<{ id: string; name: string }>;
};

function withLocalReadGuard(request: Request) {
  try {
    assertLocalHost(request);
    const url = new URL(request.url);
    const csrf = (url.searchParams.get("csrf") ?? "").trim();
    requireCsrf(request, { csrf }, { allowWhenCookieMissing: true });
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) return jsonError("INTERNAL", "요청 검증 중 오류가 발생했습니다.");
    return jsonError(guard.code, guard.message, { status: guard.status });
  }
}

export async function GET(request: Request, context: RouteContext) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guardFailure = withLocalReadGuard(request);
  if (guardFailure) return guardFailure;

  const { id, name } = await context.params;

  try {
    const blob = await getRunBlob(id, name);
    if (blob === null) {
      return jsonError("NO_DATA", "blob을 찾을 수 없습니다.", { status: 404 });
    }
    return jsonOk({ data: blob });
  } catch (error) {
    const message = error instanceof Error ? error.message : "blob 조회에 실패했습니다.";
    return jsonError("INTERNAL", message, { status: 500 });
  }
}
