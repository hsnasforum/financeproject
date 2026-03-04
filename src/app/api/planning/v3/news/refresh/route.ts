import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCsrf,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { runNewsRefresh } from "../../../../../../../planning/v3/news/cli/newsRefresh";
import { parseWithV3Whitelist } from "../../../../../../../planning/v3/security/whitelist";
import { readState } from "../../../../../../../planning/v3/news/store";

export const runtime = "nodejs";

const RefreshResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    sourcesProcessed: z.number().int().nonnegative(),
    itemsFetched: z.number().int().nonnegative(),
    itemsNew: z.number().int().nonnegative(),
    itemsDeduped: z.number().int().nonnegative(),
    errorCount: z.number().int().nonnegative(),
    lastRefreshedAt: z.string().datetime().nullable(),
  }),
});

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
    const payload = parseWithV3Whitelist(RefreshResponseSchema, {
      ok: true,
      data: {
        sourcesProcessed: result.sourcesProcessed,
        itemsFetched: result.itemsFetched,
        itemsNew: result.itemsNew,
        itemsDeduped: result.itemsDeduped,
        errorCount: result.errors.length,
        lastRefreshedAt,
      },
    }, { scope: "response", context: "api.v3.news.refresh" });
    return NextResponse.json(payload);
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
