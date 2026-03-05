import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { parseWithV3Whitelist } from "../../../../../../../planning/v3/security/whitelist";
import {
  WeeklyPlanSchema,
  readWeeklyPlan,
  writeWeeklyPlan,
} from "../../../../../../../planning/v3/news/weeklyPlan";

export const runtime = "nodejs";

const SaveBodySchema = z.object({
  csrf: z.string().optional(),
  weekOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  topics: z.array(z.string().trim().min(1)).max(200).default([]),
  seriesIds: z.array(z.string().trim().min(1)).max(200).default([]),
}).strict();

const GetResponseSchema = z.object({
  ok: z.literal(true),
  data: WeeklyPlanSchema.nullable(),
});

const PostResponseSchema = z.object({
  ok: z.literal(true),
  data: WeeklyPlanSchema,
});

function withReadGuard(request: Request): Response | null {
  try {
    assertLocalHost(request);
    return null;
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
}

function withWriteGuard(request: Request, body: unknown): Response | null {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    assertCsrf(request, body as { csrf?: unknown } | null);
    return null;
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
}

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  const payload = parseWithV3Whitelist(GetResponseSchema, {
    ok: true,
    data: readWeeklyPlan(),
  }, {
    scope: "response",
    context: "api.v3.news.weeklyPlan.get",
  });

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

  const guarded = withWriteGuard(request, body);
  if (guarded) return guarded;

  const parsed = SaveBodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "주간 계획 입력 형식이 올바르지 않습니다." } },
      { status: 400 },
    );
  }

  const saved = writeWeeklyPlan({
    weekOf: parsed.data.weekOf,
    topics: parsed.data.topics,
    seriesIds: parsed.data.seriesIds,
  });
  const payload = parseWithV3Whitelist(PostResponseSchema, {
    ok: true,
    data: saved,
  }, {
    scope: "response",
    context: "api.v3.news.weeklyPlan.post",
  });

  return NextResponse.json(payload);
}
