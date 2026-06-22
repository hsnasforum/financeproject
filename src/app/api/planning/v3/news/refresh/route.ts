import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { isPlanningRouteUser, planningUserMeta, requirePlanningRouteUser } from "@/lib/planning/api/routeAuth";
import { runNewsRefresh } from "@/lib/planning/v3/news/cli/newsRefresh";
import { parseWithV3Whitelist } from "@/lib/planning/v3/security/whitelist";
import { readCurrentUserNewsState } from "@/lib/planning/v3/service/newsRepository";

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
  meta: z.object({
    userId: z.string().min(1),
    authSource: z.enum(["auth-session", "trusted-header", "local-namespace"]),
  }),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);

    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    requireCsrf(request, body as { csrf?: unknown } | null, { allowWhenCookieMissing: true });
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

  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;
  const userMeta = planningUserMeta(currentUser);

  try {
    const result = await runNewsRefresh();
    const lastRefreshedAt = readCurrentUserNewsState().lastRunAt ?? null;
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
      meta: userMeta,
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
        meta: userMeta,
      },
      { status: 500 },
    );
  }
}
