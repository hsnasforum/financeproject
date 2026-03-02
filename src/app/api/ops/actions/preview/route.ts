import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  assertDevUnlocked,
  requireCsrf,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { opsErrorResponse } from "../../../../../lib/ops/errorContract";
import { getOpsActionDefinition, previewOpsAction, validateOpsActionParams } from "../../../../../lib/ops/actions/registry";
import { issueOpsActionPreviewToken } from "../../../../../lib/ops/actions/previewToken";
import { type OpsActionId } from "../../../../../lib/ops/actions/types";

type ActionPreviewBody = {
  csrf?: unknown;
  actionId?: unknown;
  params?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function guardRequest(request: Request, csrf: string): NextResponse | null {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    requireCsrf(request, { csrf });
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return opsErrorResponse({
        code: "INTERNAL",
        message: "요청 검증 중 오류가 발생했습니다.",
        status: 500,
      });
    }
    return opsErrorResponse({
      code: guard.code,
      message: guard.message,
      status: guard.status,
    });
  }
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: ActionPreviewBody = null;
  try {
    body = (await request.json()) as ActionPreviewBody;
  } catch {
    body = null;
  }

  const csrf = asString(body?.csrf);
  const guard = guardRequest(request, csrf);
  if (guard) return guard;

  const actionIdRaw = asString(body?.actionId);
  const definition = getOpsActionDefinition(actionIdRaw);
  if (!definition) {
    return opsErrorResponse({
      code: "VALIDATION",
      message: "지원하지 않는 actionId 입니다.",
      status: 400,
      fixHref: "/ops",
    });
  }

  const actionId = definition.id as OpsActionId;
  const params = validateOpsActionParams(actionId, body?.params);

  try {
    const preview = await previewOpsAction(actionId, params);
    const previewToken = definition.requirePreview
      ? issueOpsActionPreviewToken(actionId, params)
      : "";

    return NextResponse.json({
      ok: true,
      message: `${definition.title} 미리보기 준비 완료`,
      data: {
        actionId,
        title: definition.title,
        requirePreview: Boolean(definition.requirePreview),
        dangerous: Boolean(definition.dangerous),
        ...(definition.confirmText ? { confirmText: definition.confirmText } : {}),
        summary: preview.summary,
        ...(previewToken ? { previewToken } : {}),
      },
    });
  } catch (error) {
    return opsErrorResponse({
      code: "INTERNAL",
      message: error instanceof Error ? error.message : "preview 실행 실패",
      status: 500,
      fixHref: "/ops",
    });
  }
}
