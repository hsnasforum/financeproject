import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { parseWithV3Whitelist } from "@/lib/planning/v3/security/whitelist";
import { readDailyRoutineChecklist, saveDailyRoutineChecklist } from "@/lib/planning/v3/routines/store";

export const runtime = "nodejs";

const DateParamSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const DailyRoutineResponseSchema = z.object({
  ok: z.literal(true),
  checklist: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    savedAt: z.string().datetime().nullable(),
    items: z.array(z.object({
      id: z.string().trim().min(1),
      label: z.string().trim().min(1),
      checked: z.boolean(),
    }).strict()),
  }),
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

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request) {
  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  const dateParam = asString(new URL(request.url).searchParams.get("date"));
  try {
    const date = DateParamSchema.parse(dateParam);
    const checklist = readDailyRoutineChecklist(date);
    const payload = parseWithV3Whitelist(DailyRoutineResponseSchema, {
      ok: true,
      checklist: {
        date: checklist.date,
        savedAt: checklist.savedAt ?? null,
        items: checklist.items,
      },
    }, {
      scope: "response",
      context: "api.v3.routines.daily.get",
    });
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "date 파라미터 형식이 올바르지 않습니다." } },
      { status: 400 },
    );
  }
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

  try {
    const payload = body as { checklist?: unknown } | null;
    const checklist = saveDailyRoutineChecklist(payload?.checklist ?? {});
    const response = parseWithV3Whitelist(DailyRoutineResponseSchema, {
      ok: true,
      checklist: {
        date: checklist.date,
        savedAt: checklist.savedAt ?? null,
        items: checklist.items,
      },
    }, {
      scope: "response",
      context: "api.v3.routines.daily.post",
    });
    return NextResponse.json(response);
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "체크리스트 입력 형식이 올바르지 않습니다." } },
      { status: 400 },
    );
  }
}
