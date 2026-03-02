import {
  assertCsrf,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { jsonError, jsonOk } from "../../../../../lib/http/apiResponse";
import {
  createShareReportFromRun,
  listShareReports,
} from "../../../../../lib/planning/server/share/storage";
import { type MaskLevel } from "../../../../../lib/planning/server/share/mask";

type ShareCreateBody = {
  runId?: unknown;
  level?: unknown;
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasCsrfCookie(request: Request): boolean {
  return (request.headers.get("cookie") ?? "").includes("dev_csrf=");
}

function parseMaskLevel(value: unknown): MaskLevel {
  return value === "light" || value === "standard" || value === "strict"
    ? value
    : "standard";
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

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guardFailure = withLocalReadGuard(request);
  if (guardFailure) return guardFailure;

  try {
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(100, Math.trunc(Number(url.searchParams.get("limit"))) || 50));
    const rows = await listShareReports(limit);
    return jsonOk({
      data: rows.map((row) => ({
        id: row.id,
        runId: row.runId,
        level: row.level,
        createdAt: row.createdAt,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "공유 리포트 목록 조회에 실패했습니다.";
    return jsonError("INTERNAL", message, { status: 500 });
  }
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: ShareCreateBody = null;
  try {
    body = (await request.json()) as ShareCreateBody;
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

    const created = await createShareReportFromRun(runId, parseMaskLevel(body?.level));
    return jsonOk({
      data: {
        id: created.id,
        runId: created.runId,
        level: created.level,
        createdAt: created.createdAt,
      },
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "공유 리포트 생성에 실패했습니다.";
    if (message.includes("not found")) {
      return jsonError("NO_DATA", "run 또는 profile을 찾을 수 없습니다.", { status: 404 });
    }
    return jsonError("INTERNAL", message, { status: 500 });
  }
}
