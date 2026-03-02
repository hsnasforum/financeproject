import {
  assertLocalHost,
  toGuardErrorResponse,
} from "../../../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../../../lib/dev/onlyDev";
import { jsonError } from "../../../../../../../lib/http/apiResponse";
import { getRun } from "../../../../../../../lib/planning/server/store/runStore";
import { buildResultDtoV1FromRunRecord, isResultDtoV1 } from "../../../../../../../lib/planning/v2/resultDto";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function withLocalReadGuard(request: Request) {
  try {
    assertLocalHost(request);
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

  const { id } = await context.params;
  try {
    const run = await getRun(id);
    if (!run) {
      return jsonError("NO_DATA", "실행 기록을 찾을 수 없습니다.");
    }

    const outputs = run.outputs && typeof run.outputs === "object" ? run.outputs : {};
    const resultDto = isResultDtoV1((outputs as Record<string, unknown>).resultDto)
      ? (outputs as Record<string, unknown>).resultDto
      : buildResultDtoV1FromRunRecord(run);
    const fileName = `planning-run-result-${run.id}.json`;
    return new Response(`${JSON.stringify(resultDto, null, 2)}\n`, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "실행 기록 export에 실패했습니다.";
    return jsonError("INTERNAL", message, { status: 500 });
  }
}
