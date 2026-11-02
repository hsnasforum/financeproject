import { createCurrentUserFeedback } from "@/lib/ops/feedback/planningFeedbackStore";
import {
  type PlanningFeedback,
  type PlanningFeedbackCategory,
  type PlanningFeedbackCreateInput,
} from "@/lib/ops/feedback/planningFeedbackTypes";

export type PlanningFeedbackCreateBody = {
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

export type PlanningFeedbackCreateParseResult =
  | { ok: true; input: PlanningFeedbackCreateInput }
  | { ok: false; message: string };

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asCategory(value: unknown): PlanningFeedbackCategory | null {
  return value === "bug" || value === "ux" || value === "data" || value === "other" ? value : null;
}

export function parseCurrentUserPlanningFeedbackCreateInput(
  body: PlanningFeedbackCreateBody,
): PlanningFeedbackCreateParseResult {
  const category = asCategory(body?.content?.category);
  const title = asString(body?.content?.title);
  const message = asString(body?.content?.message);
  if (!category) {
    return { ok: false, message: "category는 bug|ux|data|other 이어야 합니다." };
  }
  if (title.length < 2 || title.length > 160) {
    return { ok: false, message: "title은 2~160자여야 합니다." };
  }
  if (message.length < 5 || message.length > 5000) {
    return { ok: false, message: "message는 5~5000자여야 합니다." };
  }

  const warningsCodes = Array.isArray(body?.context?.health?.warningsCodes)
    ? body.context.health.warningsCodes
      .map((row) => asString(row))
      .filter((row) => row.length > 0)
      .slice(0, 50)
    : undefined;
  const criticalCountRaw = Number(body?.context?.health?.criticalCount);
  const criticalCount = Number.isFinite(criticalCountRaw)
    ? Math.max(0, Math.trunc(criticalCountRaw))
    : undefined;

  return {
    ok: true,
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

export async function createCurrentUserPlanningFeedbackForRoute(
  input: PlanningFeedbackCreateInput,
): Promise<PlanningFeedback> {
  return createCurrentUserFeedback(input);
}
