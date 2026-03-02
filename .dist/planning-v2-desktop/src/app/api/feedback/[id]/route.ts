import { NextResponse } from "next/server";
import {
  getFeedbackById,
  MAX_FEEDBACK_NOTE_LENGTH,
  MAX_FEEDBACK_TASK_ID_LENGTH,
  MAX_FEEDBACK_TASK_TEXT_LENGTH,
  MAX_FEEDBACK_TASKS,
  MAX_FEEDBACK_TAGS,
  MAX_FEEDBACK_TAG_LENGTH,
  updateFeedback,
  type FeedbackPriority,
  type FeedbackStatus,
  type FeedbackTask,
} from "@/lib/feedback/feedbackStore";

type Params = { id: string };

export async function GET(_request: Request, context: { params: Promise<Params> }) {
  try {
    const params = await context.params;
    const id = String(params.id ?? "").trim();
    if (!id) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "id를 입력하세요." } },
        { status: 400 },
      );
    }

    const item = getFeedbackById(id);
    if (!item) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "해당 피드백을 찾지 못했습니다." } },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: item,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "STORE_FAILED", message: "피드백 조회에 실패했습니다." } },
      { status: 500 },
    );
  }
}

type FeedbackPatchBody = {
  status?: unknown;
  tags?: unknown;
  note?: unknown;
  priority?: unknown;
  dueDate?: unknown;
  tasks?: unknown;
};

function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  return value === "OPEN" || value === "DOING" || value === "DONE";
}

function isFeedbackPriority(value: unknown): value is FeedbackPriority {
  return value === "P0" || value === "P1" || value === "P2" || value === "P3";
}

function normalizeTagList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") return null;
    const trimmed = entry.trim().replace(/\s+/g, " ");
    if (!trimmed) continue;
    if (trimmed.length > MAX_FEEDBACK_TAG_LENGTH) return null;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length > MAX_FEEDBACK_TAGS) return null;
  }
  return out;
}

function normalizeDueDate(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const parsed = Date.parse(`${trimmed}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return null;
  const iso = new Date(parsed).toISOString().slice(0, 10);
  return iso === trimmed ? trimmed : null;
}

function normalizeTaskList(value: unknown): FeedbackTask[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_FEEDBACK_TASKS) return null;
  const out: FeedbackTask[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.text !== "string" || typeof row.done !== "boolean") return null;
    const id = row.id.trim();
    const text = row.text.trim().replace(/\s+/g, " ");
    if (!id || id.length > MAX_FEEDBACK_TASK_ID_LENGTH) return null;
    if (text.length < 1 || text.length > MAX_FEEDBACK_TASK_TEXT_LENGTH) return null;
    if (seen.has(id)) return null;
    seen.add(id);
    out.push({ id, text, done: row.done });
  }
  return out;
}

export async function PATCH(request: Request, context: { params: Promise<Params> }) {
  try {
    const params = await context.params;
    const id = String(params.id ?? "").trim();
    if (!id) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "id를 입력하세요." } },
        { status: 400 },
      );
    }

    let body: FeedbackPatchBody;
    try {
      body = (await request.json()) as FeedbackPatchBody;
    } catch {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_JSON", message: "JSON body 형식이 올바르지 않습니다." } },
        { status: 400 },
      );
    }

    const patch: {
      status?: FeedbackStatus;
      tags?: string[];
      note?: string;
      priority?: FeedbackPriority;
      dueDate?: string | null;
      tasks?: FeedbackTask[];
    } = {};

    if (Object.prototype.hasOwnProperty.call(body, "status")) {
      if (!isFeedbackStatus(body.status)) {
        return NextResponse.json(
          { ok: false, error: { code: "INVALID_STATUS", message: "status는 OPEN|DOING|DONE 이어야 합니다." } },
          { status: 400 },
        );
      }
      patch.status = body.status;
    }

    if (Object.prototype.hasOwnProperty.call(body, "tags")) {
      const parsedTags = normalizeTagList(body.tags);
      if (!parsedTags) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "INVALID_TAGS",
              message: `tags는 문자열 배열이어야 하며 최대 ${MAX_FEEDBACK_TAGS}개, 각 길이 ${MAX_FEEDBACK_TAG_LENGTH}자 이하여야 합니다.`,
            },
          },
          { status: 400 },
        );
      }
      patch.tags = parsedTags;
    }

    if (Object.prototype.hasOwnProperty.call(body, "note")) {
      if (typeof body.note !== "string") {
        return NextResponse.json(
          { ok: false, error: { code: "INVALID_NOTE", message: "note는 문자열이어야 합니다." } },
          { status: 400 },
        );
      }
      const normalized = body.note.trim();
      if (normalized.length > MAX_FEEDBACK_NOTE_LENGTH) {
        return NextResponse.json(
          {
            ok: false,
            error: { code: "INVALID_NOTE", message: `note는 최대 ${MAX_FEEDBACK_NOTE_LENGTH}자까지 허용됩니다.` },
          },
          { status: 400 },
        );
      }
      patch.note = normalized;
    }

    if (Object.prototype.hasOwnProperty.call(body, "priority")) {
      if (!isFeedbackPriority(body.priority)) {
        return NextResponse.json(
          { ok: false, error: { code: "INVALID_PRIORITY", message: "priority는 P0|P1|P2|P3 이어야 합니다." } },
          { status: 400 },
        );
      }
      patch.priority = body.priority;
    }

    if (Object.prototype.hasOwnProperty.call(body, "dueDate")) {
      if (body.dueDate !== null && typeof body.dueDate !== "string") {
        return NextResponse.json(
          { ok: false, error: { code: "INVALID_DUEDATE", message: "dueDate는 YYYY-MM-DD 또는 null 이어야 합니다." } },
          { status: 400 },
        );
      }
      const normalizedDueDate = normalizeDueDate(body.dueDate);
      if (body.dueDate !== null && normalizedDueDate === null) {
        return NextResponse.json(
          { ok: false, error: { code: "INVALID_DUEDATE", message: "dueDate 형식이 올바르지 않습니다. (YYYY-MM-DD)" } },
          { status: 400 },
        );
      }
      patch.dueDate = normalizedDueDate;
    }

    if (Object.prototype.hasOwnProperty.call(body, "tasks")) {
      const normalizedTasks = normalizeTaskList(body.tasks);
      if (!normalizedTasks) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "INVALID_TASKS",
              message: `tasks는 최대 ${MAX_FEEDBACK_TASKS}개의 {id,text,done} 배열이며 text는 1~${MAX_FEEDBACK_TASK_TEXT_LENGTH}자여야 합니다.`,
            },
          },
          { status: 400 },
        );
      }
      patch.tasks = normalizedTasks;
    }

    const updated = updateFeedback(id, patch);
    if (!updated) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "해당 피드백을 찾지 못했습니다." } },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, data: updated });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "STORE_FAILED", message: "피드백 저장에 실패했습니다." } },
      { status: 500 },
    );
  }
}
