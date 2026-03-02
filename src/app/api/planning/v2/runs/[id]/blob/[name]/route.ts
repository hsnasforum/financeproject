import {
  assertLocalHost,
  requireCsrf,
  toGuardErrorResponse,
} from "../../../../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../../../../lib/dev/onlyDev";
import { jsonError, jsonOk } from "../../../../../../../../lib/http/apiResponse";
import { getRunBlob } from "../../../../../../../../lib/planning/server/store/runStore";
import { gzipSync } from "node:zlib";

type RouteContext = {
  params: Promise<{ id: string; name: string }>;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parsePositiveInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function wantsGzip(request: Request): boolean {
  const url = new URL(request.url);
  const query = asString(url.searchParams.get("gzip")).toLowerCase();
  if (query === "1" || query === "true" || query === "yes") return true;
  const acceptEncoding = asString(request.headers.get("accept-encoding")).toLowerCase();
  return acceptEncoding.includes("gzip");
}

function jsonResponseWithOptionalGzip(request: Request, payload: unknown): Response {
  const jsonBytes = Buffer.from(JSON.stringify(payload), "utf-8");
  const gzipEnabled = wantsGzip(request) && jsonBytes.length >= 1024;
  if (!gzipEnabled) {
    return new Response(jsonBytes, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
  const gzipped = gzipSync(jsonBytes, { level: 6 });
  return new Response(gzipped, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-encoding": "gzip",
      "cache-control": "no-store",
      "vary": "accept-encoding",
    },
  });
}

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
  const url = new URL(request.url);
  const isPreview = asString(url.searchParams.get("view")).toLowerCase() === "preview";

  try {
    const blob = await getRunBlob(id, name);
    if (blob === null) {
      return jsonError("NO_DATA", "blob을 찾을 수 없습니다.", { status: 404 });
    }
    if (!isPreview) {
      return jsonResponseWithOptionalGzip(request, {
        ok: true,
        data: blob,
      });
    }

    const cursor = parsePositiveInt(url.searchParams.get("cursor"), 0, 0, Number.MAX_SAFE_INTEGER);
    const chunkChars = parsePositiveInt(url.searchParams.get("chunkChars"), 16_000, 64, 120_000);
    const serialized = `${JSON.stringify(blob, null, 2)}\n`;
    const safeCursor = Math.min(cursor, serialized.length);
    const text = serialized.slice(safeCursor, safeCursor + chunkChars);
    const nextCursor = safeCursor + text.length;
    const hasMore = nextCursor < serialized.length;
    return jsonOk({
      data: {
        text,
        cursor: safeCursor,
        nextCursor,
        chunkChars,
        totalChars: serialized.length,
        hasMore,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "blob 조회에 실패했습니다.";
    return jsonError("INTERNAL", message, { status: 500 });
  }
}
