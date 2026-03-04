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
import {
  loadEffectiveAlertRules,
  readAlertRuleOverrides,
  readAlertRulesConfig,
  writeAlertRuleOverrides,
} from "@/lib/news/alerts";

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

function withReadGuard(request: Request): Response | null {
  try {
    assertLocalHost(request);
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

  const defaults = readAlertRulesConfig();
  const overrides = readAlertRuleOverrides();
  const effective = loadEffectiveAlertRules();

  return NextResponse.json({
    ok: true,
    data: {
      defaults,
      overrides,
      effective,
    },
  });
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
      { ok: false, error: { code: "INPUT", message: "규칙 오버라이드 입력 형식이 올바르지 않습니다." } },
      { status: 400 },
    );
  }

  const written = writeAlertRuleOverrides({ rules: parsed.data.rules });
  const effective = loadEffectiveAlertRules();

  return NextResponse.json({
    ok: true,
    data: {
      overrides: written,
      effective,
    },
  });
}
