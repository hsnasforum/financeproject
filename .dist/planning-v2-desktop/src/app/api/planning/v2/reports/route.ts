import {
  assertCsrf,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { jsonError, jsonOk } from "../../../../../lib/http/apiResponse";
import {
  createReportFromRun,
  listReports,
} from "../../../../../lib/planning/server/reports/storage";

type ReportsCreateBody = {
  runId?: unknown;
  csrf?: unknown;
} | null;

function hasCsrfCookie(request: Request): boolean {
  return (request.headers.get("cookie") ?? "").includes("dev_csrf=");
}

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

function withLocalWriteGuard(request: Request, body: { csrf?: unknown } | null) {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    const csrfToken = typeof body?.csrf === "string" ? body.csrf.trim() : "";
    if (hasCsrfCookie(request) && csrfToken) {
      assertCsrf(request, { csrf: csrfToken });
    }
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) return jsonError("INTERNAL", "요청 검증 중 오류가 발생했습니다.");
    return jsonError(guard.code, guard.message, { status: guard.status });
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guardFailure = withLocalReadGuard(request);
  if (guardFailure) return guardFailure;

  try {
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(200, Math.trunc(Number(url.searchParams.get("limit"))) || 50));
    const rows = await listReports(limit);
    return jsonOk({
      data: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        kind: row.kind,
        ...(row.runId ? { runId: row.runId } : {}),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "리포트 목록 조회에 실패했습니다.";
    return jsonError("INTERNAL", message, { status: 500 });
  }
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: ReportsCreateBody = null;
  try {
    body = (await request.json()) as ReportsCreateBody;
  } catch {
    body = null;
  }

  const guardFailure = withLocalWriteGuard(request, body);
  if (guardFailure) return guardFailure;

  try {
    const runId = asString(body?.runId);
    if (!runId) {
      return jsonError("INPUT", "runId는 필수입니다.", { status: 400 });
    }

    const created = await createReportFromRun(runId);
    return jsonOk({ data: created }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "리포트 생성에 실패했습니다.";
    if (message.includes("not found")) {
      return jsonError("NO_DATA", "run 또는 profile을 찾을 수 없습니다.", { status: 404 });
    }
    return jsonError("INTERNAL", message, { status: 500 });
  }
}
