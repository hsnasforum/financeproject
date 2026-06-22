import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import {
  readCurrentUserAlertRules,
  writeCurrentUserAlertRuleOverrides,
} from "@/lib/planning/v3/service/newsAlertRulesRepository";
import { parseWithV3Whitelist } from "@/lib/planning/v3/security/whitelist";
import {
  isPlanningRouteUser,
  planningUserMeta,
  requirePlanningRouteUser,
} from "@/lib/planning/api/routeAuth";

const RuleOverrideInputSchema = z.object({
  id: z.string().trim().min(1),
  enabled: z.boolean().optional(),
  level: z.enum(["high", "medium", "low"]).optional(),
  topicId: z.string().trim().min(1).optional(),
  minBurstLevel: z.enum(["중", "상"]).optional(),
  minTodayCount: z.number().int().nonnegative().optional(),
  seriesId: z.string().trim().min(1).optional(),
  metric: z.enum(["pctChange", "zscore", "regime"]).optional(),
  window: z.number().int().positive().max(365).optional(),
  condition: z.enum(["up", "down", "high", "low", "flat", "unknown"]).optional(),
  threshold: z.number().finite().optional(),
  targetType: z.enum(["topic", "item", "scenario", "series"]).optional(),
  targetId: z.string().trim().min(1).optional(),
});

const SaveBodySchema = z.object({
  csrf: z.string().optional(),
  rules: z.array(RuleOverrideInputSchema).default([]),
});

const UserMetaSchema = z.object({
  userId: z.string().min(1),
  authSource: z.enum(["auth-session", "trusted-header", "local-namespace"]),
});

const RulesGetResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    updatedAt: z.string().datetime().nullable(),
    defaults: z.unknown(),
    overrides: z.unknown(),
    effective: z.unknown(),
  }),
  meta: UserMetaSchema,
});

const RulesPostResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    updatedAt: z.string().datetime().nullable(),
    overrides: z.unknown(),
    effective: z.unknown(),
  }),
  meta: UserMetaSchema,
});

function withReadGuard(request: Request): Response | null {
  try {
    assertSameOrigin(request);
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
    assertSameOrigin(request);
    requireCsrf(request, body as { csrf?: unknown } | null, { allowWhenCookieMissing: true });
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
  const guarded = withReadGuard(request);
  if (guarded) return guarded;
  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;
  const userMeta = planningUserMeta(currentUser);

  const { defaults, overrides, effective } = readCurrentUserAlertRules();

  const payload = parseWithV3Whitelist(RulesGetResponseSchema, {
    ok: true,
    data: {
      updatedAt: overrides.updatedAt ?? null,
      defaults,
      overrides,
      effective,
    },
    meta: userMeta,
  }, { scope: "response", context: "api.v3.news.alertRules.get" });
  return NextResponse.json(payload);
}

export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const guarded = withWriteGuard(request, body);
  if (guarded) return guarded;
  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;
  const userMeta = planningUserMeta(currentUser);

  const parsed = SaveBodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "INPUT", message: "규칙 오버라이드 입력 형식이 올바르지 않습니다." },
        meta: userMeta,
      },
      { status: 400 },
    );
  }

  const { written, effective } = writeCurrentUserAlertRuleOverrides({ rules: parsed.data.rules });

  const payload = parseWithV3Whitelist(RulesPostResponseSchema, {
    ok: true,
    data: {
      updatedAt: written.updatedAt ?? null,
      overrides: written,
      effective,
    },
    meta: userMeta,
  }, { scope: "response", context: "api.v3.news.alertRules.post" });
  return NextResponse.json(payload);
}
