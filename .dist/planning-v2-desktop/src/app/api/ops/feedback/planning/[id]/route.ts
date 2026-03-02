import { NextResponse } from "next/server";
import { append as appendAuditLog } from "../../../../../../lib/audit/auditLogStore";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../../lib/dev/onlyDev";
import { deleteFeedback, getFeedback, updateFeedback } from "../../../../../../lib/ops/feedback/planningFeedbackStore";
import { jsonError } from "../../../../../../lib/http/apiResponse";
import type { PlanningFeedbackPriority, PlanningFeedbackStatus } from "../../../../../../lib/ops/feedback/planningFeedbackTypes";

type Params = { id: string };

type FeedbackPatchBody = {
  csrf?: unknown;
  triage?: {
    status?: unknown;
    priority?: unknown;
    tags?: unknown;
    due?: unknown;
  } | null;
} | null;

type FeedbackDeleteBody = {
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStatus(value: unknown): PlanningFeedbackStatus | undefined {
  return value === "new" || value === "triaged" || value === "doing" || value === "done"
    ? value
    : undefined;
}

function asPriority(value: unknown): PlanningFeedbackPriority | undefined {
  return value === "p0" || value === "p1" || value === "p2" || value === "p3"
    ? value
    : undefined;
}

function asTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((row) => asString(row)).filter((row) => row.length > 0).slice(0, 20);
}

function asDue(value: unknown): string | undefined {
  const raw = asString(value);
  if (!raw) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const parsed = Date.parse(`${raw}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? raw : undefined;
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
    if (!guard) return jsonError("INTERNAL", "요청 검증 중 오류가 발생했습니다.", { status: 500 });
    return jsonError(guard.code, guard.message, { status: guard.status });
  }
}

function appendAudit(event: "PLANNING_FEEDBACK_UPDATE" | "PLANNING_FEEDBACK_DELETE", id: string, details?: Record<string, unknown>) {
  try {
    appendAuditLog({
      event,
      route: `/api/ops/feedback/planning/${id}`,
      summary: `${event} ${id}`,
      details: { id, ...(details ?? {}) },
    });
  } catch (error) {
    console.error("[audit] planning feedback append failed", error);
  }
}

export async function GET(request: Request, context: { params: Promise<Params> }) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const csrf = asString(searchParams.get("csrf"));
  const guard = guardRequest(request, csrf);
  if (guard) return guard;

  const params = await context.params;
  const id = asString(params.id);
  if (!id) {
    return jsonError("INPUT", "id를 입력하세요.", { status: 400 });
  }

  const found = await getFeedback(id);
  if (!found) {
    return jsonError("NO_DATA", "피드백을 찾지 못했습니다.", { status: 404 });
  }

  return NextResponse.json({ ok: true, data: found });
}

export async function PATCH(request: Request, context: { params: Promise<Params> }) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: FeedbackPatchBody = null;
  try {
    body = (await request.json()) as FeedbackPatchBody;
  } catch {
    body = null;
  }

  const guard = guardRequest(request, asString(body?.csrf));
  if (guard) return guard;

  const params = await context.params;
  const id = asString(params.id);
  if (!id) {
    return jsonError("INPUT", "id를 입력하세요.", { status: 400 });
  }

  const status = asStatus(body?.triage?.status);
  const priority = asPriority(body?.triage?.priority);
  const tags = asTags(body?.triage?.tags);
  const dueProvided = isRecord(body?.triage) && Object.prototype.hasOwnProperty.call(body?.triage ?? {}, "due");
  const due = dueProvided ? asDue(body?.triage?.due) : undefined;

  const updated = await updateFeedback(id, {
    triage: {
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(tags ? { tags } : {}),
      ...(dueProvided ? { due } : {}),
    },
  });
  if (!updated) {
    return jsonError("NO_DATA", "피드백을 찾지 못했습니다.", { status: 404 });
  }

  appendAudit("PLANNING_FEEDBACK_UPDATE", id, {
    status: updated.triage.status,
    priority: updated.triage.priority,
    tags: updated.triage.tags,
    due: updated.triage.due ?? null,
  });

  return NextResponse.json({ ok: true, data: updated });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function DELETE(request: Request, context: { params: Promise<Params> }) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: FeedbackDeleteBody = null;
  try {
    body = (await request.json()) as FeedbackDeleteBody;
  } catch {
    body = null;
  }

  const guard = guardRequest(request, asString(body?.csrf));
  if (guard) return guard;

  const params = await context.params;
  const id = asString(params.id);
  if (!id) {
    return jsonError("INPUT", "id를 입력하세요.", { status: 400 });
  }

  const deleted = await deleteFeedback(id);
  if (!deleted) {
    return jsonError("NO_DATA", "피드백을 찾지 못했습니다.", { status: 404 });
  }

  appendAudit("PLANNING_FEEDBACK_DELETE", id);
  return NextResponse.json({ ok: true, data: { id, deleted: true } });
}
