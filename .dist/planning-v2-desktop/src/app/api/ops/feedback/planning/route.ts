import { NextResponse } from "next/server";
import { append as appendAuditLog } from "../../../../../lib/audit/auditLogStore";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { createFeedback, listFeedback } from "../../../../../lib/ops/feedback/planningFeedbackStore";
import { jsonError } from "../../../../../lib/http/apiResponse";
import type {
  PlanningFeedbackCategory,
  PlanningFeedbackStatus,
} from "../../../../../lib/ops/feedback/planningFeedbackTypes";

type FeedbackCreateBody = {
  csrf?: unknown;
  from?: { screen?: unknown } | null;
  context?: {
    snapshot?: { id?: unknown; asOf?: unknown; fetchedAt?: unknown; missing?: unknown } | null;
    runId?: unknown;
    reportId?: unknown;
    health?: { criticalCount?: unknown; warningsCodes?: unknown } | null;
  } | null;
  content?: {
    category?: unknown;
    title?: unknown;
    message?: unknown;
  } | null;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStatus(value: unknown): PlanningFeedbackStatus | null {
  return value === "new" || value === "triaged" || value === "doing" || value === "done" ? value : null;
}

function asCategory(value: unknown): PlanningFeedbackCategory | null {
  return value === "bug" || value === "ux" || value === "data" || value === "other" ? value : null;
}

function asFiniteInt(value: unknown, fallback: number): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function parseCreateInput(body: FeedbackCreateBody) {
  const category = asCategory(body?.content?.category);
  const title = asString(body?.content?.title);
  const message = asString(body?.content?.message);
  if (!category) {
    return { ok: false as const, message: "category는 bug|ux|data|other 이어야 합니다." };
  }
  if (title.length < 2 || title.length > 160) {
    return { ok: false as const, message: "title은 2~160자여야 합니다." };
  }
  if (message.length < 5 || message.length > 5000) {
    return { ok: false as const, message: "message는 5~5000자여야 합니다." };
  }

  const warningsCodes = Array.isArray(body?.context?.health?.warningsCodes)
    ? body?.context?.health?.warningsCodes.map((row) => asString(row)).filter((row) => row.length > 0).slice(0, 50)
    : undefined;
  const criticalCountRaw = Number(body?.context?.health?.criticalCount);
  const criticalCount = Number.isFinite(criticalCountRaw) ? Math.max(0, Math.trunc(criticalCountRaw)) : undefined;

  return {
    ok: true as const,
    input: {
      from: {
        screen: asString(body?.from?.screen) || "/planning",
      },
      context: {
        ...(body?.context?.snapshot ? {
          snapshot: {
            ...(asString(body.context.snapshot.id) ? { id: asString(body.context.snapshot.id) } : {}),
            ...(asString(body.context.snapshot.asOf) ? { asOf: asString(body.context.snapshot.asOf) } : {}),
            ...(asString(body.context.snapshot.fetchedAt) ? { fetchedAt: asString(body.context.snapshot.fetchedAt) } : {}),
            ...(typeof body.context.snapshot.missing === "boolean" ? { missing: body.context.snapshot.missing } : {}),
          },
        } : {}),
        ...(asString(body?.context?.runId) ? { runId: asString(body?.context?.runId) } : {}),
        ...(asString(body?.context?.reportId) ? { reportId: asString(body?.context?.reportId) } : {}),
        ...((typeof criticalCount === "number" || (warningsCodes && warningsCodes.length > 0))
          ? {
            health: {
              ...(typeof criticalCount === "number" ? { criticalCount } : {}),
              ...(warningsCodes && warningsCodes.length > 0 ? { warningsCodes } : {}),
            },
          }
          : {}),
      },
      content: {
        category,
        title,
        message,
      },
    },
  };
}

function appendCreateAudit(id: string, category: PlanningFeedbackCategory, screen: string): void {
  try {
    appendAuditLog({
      event: "PLANNING_FEEDBACK_CREATE",
      route: "/api/ops/feedback/planning",
      summary: `PLANNING_FEEDBACK_CREATE ${id}`,
      details: { id, category, screen },
    });
  } catch (error) {
    console.error("[audit] planning feedback create append failed", error);
  }
}

function guardRequest(request: Request, csrf: string): NextResponse | null {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    assertCsrf(request, { csrf });
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return jsonError("INTERNAL", "요청 검증 중 오류가 발생했습니다.", { status: 500 });
    }
    return jsonError(guard.code, guard.message, { status: guard.status });
  }
}

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const csrf = asString(searchParams.get("csrf"));
  const guard = guardRequest(request, csrf);
  if (guard) return guard;

  const status = asStatus(searchParams.get("status"));
  const limit = Math.max(1, Math.min(300, asFiniteInt(searchParams.get("limit"), 100)));

  try {
    const rows = await listFeedback({
      ...(status ? { status } : {}),
      limit,
    });
    return NextResponse.json({
      ok: true,
      data: rows,
      meta: {
        total: rows.length,
        ...(status ? { status } : {}),
        limit,
      },
    });
  } catch (error) {
    return jsonError(
      "STORAGE_CORRUPT",
      error instanceof Error ? error.message : "피드백 목록 조회에 실패했습니다.",
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: FeedbackCreateBody = null;
  try {
    body = (await request.json()) as FeedbackCreateBody;
  } catch {
    body = null;
  }

  const csrf = asString(body?.csrf);
  const guard = guardRequest(request, csrf);
  if (guard) return guard;

  const parsed = parseCreateInput(body);
  if (!parsed.ok) {
    return jsonError("INPUT", parsed.message, { status: 400 });
  }

  try {
    const created = await createFeedback(parsed.input);
    appendCreateAudit(created.id, created.content.category, created.from.screen);
    return NextResponse.json({
      ok: true,
      data: created,
      message: `저장됨(${created.id})`,
    }, { status: 201 });
  } catch (error) {
    return jsonError(
      "STORAGE_CORRUPT",
      error instanceof Error ? error.message : "피드백 저장에 실패했습니다.",
      { status: 500 },
    );
  }
}
