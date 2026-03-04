import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCsrf,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { parseWithV3Whitelist } from "../../../../../../../planning/v3/security/whitelist";
import {
  NewsSourceImportApplyResultSchema,
  NewsSourceImportPreviewSchema,
  NewsSourceTransferItemSchema,
  applyImportNewsSources,
  exportNewsSourceList,
  previewImportNewsSources,
} from "../../../../../../../planning/v3/news/sourceTransfer";

const SourcesGetResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    items: z.array(NewsSourceTransferItemSchema),
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
  const blocked = onlyDev();
  if (blocked) return blocked;

  try {
    assertLocalHost(request);
    assertSameOrigin(request);
  } catch (error) {
    return toGuardResponse(error);
  }

  const items = exportNewsSourceList();
  const payload = parseWithV3Whitelist(SourcesGetResponseSchema, {
    ok: true,
    data: { items },
  }, { scope: "response", context: "api.v3.news.sources.get" });
  return NextResponse.json(payload);
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertCsrf(request, body as { csrf?: unknown } | null);
  } catch (error) {
    return toGuardResponse(error);
  }

  const parsed = SourcesPostBodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "소스 import 요청 형식이 올바르지 않습니다." } },
      { status: 400 },
    );
  }

  const preview = previewImportNewsSources(parsed.data.items);
  const applied = parsed.data.mode === "apply"
    ? applyImportNewsSources(parsed.data.items)
    : null;

  const payload = parseWithV3Whitelist(SourcesPostResponseSchema, {
    ok: true,
    data: {
      mode: parsed.data.mode,
      preview,
      applied,
    },
  }, { scope: "response", context: "api.v3.news.sources.post" });
  return NextResponse.json(payload);
}
