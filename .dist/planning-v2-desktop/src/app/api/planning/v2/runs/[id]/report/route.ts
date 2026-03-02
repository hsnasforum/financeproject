import {
  assertLocalHost,
  toGuardErrorResponse,
} from "../../../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../../../lib/dev/onlyDev";
import { jsonError } from "../../../../../../../lib/http/apiResponse";
import { getRun } from "../../../../../../../lib/planning/server/store/runStore";
import { renderHtmlReport } from "../../../../../../../lib/planning/v2/report/htmlReport";
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
    const url = new URL(request.url);
    const run = await getRun(id);
    if (!run) {
      return jsonError("NO_DATA", "실행 기록을 찾을 수 없습니다.");
    }

    const outputs = run.outputs && typeof run.outputs === "object" ? run.outputs : {};
    const resultDto = isResultDtoV1((outputs as Record<string, unknown>).resultDto)
      ? (outputs as Record<string, unknown>).resultDto
      : buildResultDtoV1FromRunRecord(run);

    const compareToRunId = (url.searchParams.get("compareTo") ?? "").trim();
    let compareTo: { dto: typeof resultDto; label?: string } | undefined;
    if (compareToRunId && compareToRunId !== run.id) {
      const compareRun = await getRun(compareToRunId);
      if (compareRun) {
        const compareOutputs = compareRun.outputs && typeof compareRun.outputs === "object" ? compareRun.outputs : {};
        const compareDto = isResultDtoV1((compareOutputs as Record<string, unknown>).resultDto)
          ? (compareOutputs as Record<string, unknown>).resultDto
          : buildResultDtoV1FromRunRecord(compareRun);
        compareTo = {
          dto: compareDto,
          label: compareRun.title || compareRun.id.slice(0, 8),
        };
      }
    }

    const html = renderHtmlReport(resultDto, {
      title: run.title ? `${run.title} - 재무설계 결과 리포트` : "재무설계 결과 리포트",
      locale: "ko-KR",
      theme: "light",
      ...(compareTo ? { compareTo } : {}),
    });
    const shouldDownload = url.searchParams.get("download") === "1";
    const fileName = `planning-run-report-${run.id}.html`;

    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        ...(shouldDownload ? { "content-disposition": `attachment; filename="${fileName}"` } : {}),
      },
    });
  } catch {
    return jsonError("INTERNAL", "리포트 생성에 실패했습니다.", { status: 500 });
  }
}
