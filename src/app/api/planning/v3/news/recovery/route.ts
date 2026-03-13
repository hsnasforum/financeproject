import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import {
  RecoveryActionSchema,
  RecoveryExecutionSchema,
  RecoverySummarySchema,
  previewRecoveryAction,
  runRecoveryAction,
} from "@/lib/planning/v3/news/recovery";
import { parseWithV3Whitelist } from "@/lib/planning/v3/security/whitelist";

export const runtime = "nodejs";

const RecoveryBodySchema = z.object({
  csrf: z.string().optional(),
  action: RecoveryActionSchema,
  confirm: z.boolean().optional(),
});

const RecoveryResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    requiresConfirmation: z.boolean(),
    summary: RecoverySummarySchema,
    execution: RecoveryExecutionSchema.nullable(),
  }),
});

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

  const parsed = RecoveryBodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "복구 요청 형식이 올바르지 않습니다." } },
      { status: 400 },
    );
  }

  const summary = previewRecoveryAction(parsed.data.action);
  if (parsed.data.confirm !== true) {
    const payload = parseWithV3Whitelist(RecoveryResponseSchema, {
      ok: true,
      data: {
        requiresConfirmation: true,
        summary,
        execution: null,
      },
    }, { scope: "response", context: "api.v3.news.recovery.preview" });
    return NextResponse.json(payload);
  }

  const execution = runRecoveryAction(parsed.data.action);
  const payload = parseWithV3Whitelist(RecoveryResponseSchema, {
    ok: true,
    data: {
      requiresConfirmation: false,
      summary,
      execution,
    },
  }, { scope: "response", context: "api.v3.news.recovery.run" });
  return NextResponse.json(payload);
}
