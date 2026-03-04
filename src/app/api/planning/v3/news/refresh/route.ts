import { NextResponse } from "next/server";
import {
  assertCsrf,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { runNewsRefresh } from "../../../../../../../planning/v3/news/cli/newsRefresh";
import { readState } from "../../../../../../../planning/v3/news/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  try {
    assertLocalHost(request);
    assertSameOrigin(request);

    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    assertCsrf(request, body as { csrf?: unknown } | null);
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "요청 검증 중 오류가 발생했습니다." } },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: guard.code, message: guard.message } },
      { status: guard.status },
    );
  }

  try {
    const result = await runNewsRefresh();
    const lastRefreshedAt = readState().lastRunAt ?? null;
    return NextResponse.json({
      ok: true,
      data: {
        sourcesProcessed: result.sourcesProcessed,
        itemsFetched: result.itemsFetched,
        itemsNew: result.itemsNew,
        itemsDeduped: result.itemsDeduped,
        errorCount: result.errors.length,
        lastRefreshedAt,
      },
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL",
          message: "뉴스 갱신 실행 중 오류가 발생했습니다.",
        },
      },
      { status: 500 },
    );
  }
}
