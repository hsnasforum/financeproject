import {
  NextResponse } from "next/server";
import { z } from "zod";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
  } from "@/lib/dev/devGuards";
import {
  planningUserMeta,
  withPlanningRouteUser,
} from "@/lib/planning/api/routeAuth";
import {
  NewsSourceImportApplyResultSchema,
  NewsSourceImportPreviewSchema,
  NewsSourceTransferItemSchema,
  applyImportNewsSources,
  exportNewsSourceList,
  previewImportNewsSources,
} from "@/lib/planning/v3/news/sourceTransfer";
import { parseWithV3Whitelist } from "@/lib/planning/v3/security/whitelist";

const SourcesGetResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    items: z.array(NewsSourceTransferItemSchema),
  }),
  meta: z.object({
    userId: z.string().min(1),
    authSource: z.enum(["auth-session", "trusted-header", "local-namespace"]),
  }),
});

const SourcesPostBodySchema = z.object({
  csrf: z.string().optional(),
  mode: z.enum(["dry_run", "apply"]),
  items: z.array(z.unknown()).default([]),
});

const SourcesPostResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    mode: z.enum(["dry_run", "apply"]),
    preview: NewsSourceImportPreviewSchema,
    applied: NewsSourceImportApplyResultSchema.nullable(),
  }),
  meta: z.object({
    userId: z.string().min(1),
    authSource: z.enum(["auth-session", "trusted-header", "local-namespace"]),
  }),
});

function toGuardResponse(error: unknown): Response {
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

export async function GET(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return toGuardResponse(error);
  }

  return await withPlanningRouteUser(request, async (currentUser) => {
    const userMeta = planningUserMeta(currentUser);

    const items = exportNewsSourceList();
    const payload = parseWithV3Whitelist(SourcesGetResponseSchema, {
      ok: true,
      data: { items },
      meta: userMeta,
    }, { scope: "response", context: "api.v3.news.sources.get" });
    return NextResponse.json(payload);
  });
}

export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  try {
    assertSameOrigin(request);
    requireCsrf(request, body as { csrf?: unknown } | null, { allowWhenCookieMissing: true });
  } catch (error) {
    return toGuardResponse(error);
  }

  return await withPlanningRouteUser(request, async (currentUser) => {
    const userMeta = planningUserMeta(currentUser);

    const parsed = SourcesPostBodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "INPUT", message: "소스 import 요청 형식이 올바르지 않습니다." },
          meta: userMeta,
        },
        { status: 400 },
      );
    }

    let preview: z.infer<typeof NewsSourceImportPreviewSchema>;
    let applied: z.infer<typeof NewsSourceImportApplyResultSchema> | null = null;
    try {
      preview = previewImportNewsSources(parsed.data.items);
      applied = parsed.data.mode === "apply"
        ? applyImportNewsSources(parsed.data.items)
        : null;
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "INTERNAL", message: "뉴스 소스 import 처리 중 오류가 발생했습니다." },
          meta: userMeta,
        },
        { status: 500 },
      );
    }

    const payload = parseWithV3Whitelist(SourcesPostResponseSchema, {
      ok: true,
      data: {
        mode: parsed.data.mode,
        preview,
        applied,
      },
      meta: userMeta,
    }, { scope: "response", context: "api.v3.news.sources.post" });
    return NextResponse.json(payload);
  });
}
