import { issueOpsActionPreviewToken } from "./previewToken";
import { getOpsActionDefinition, previewOpsAction, validateOpsActionParams } from "./registry";
import { type OpsActionId, type OpsActionPreviewResult } from "./types";

export type OpsActionPreviewRouteResult =
  | {
    kind: "completed";
    message: string;
    data: {
      actionId: OpsActionId;
      title: string;
      requirePreview: boolean;
      dangerous: boolean;
      confirmText?: string;
      summary: OpsActionPreviewResult["summary"];
      previewToken?: string;
    };
  }
  | {
    kind: "validation-error";
    message: string;
  }
  | {
    kind: "internal-error";
    message: string;
  };

export type OpsActionPreviewRouteInput = {
  actionId: unknown;
  params: unknown;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function previewOpsActionRoute(input: OpsActionPreviewRouteInput): Promise<OpsActionPreviewRouteResult> {
  const definition = getOpsActionDefinition(asString(input.actionId));
  if (!definition) {
    return {
      kind: "validation-error",
      message: "지원하지 않는 actionId 입니다.",
    };
  }

  const actionId = definition.id as OpsActionId;
  const params = validateOpsActionParams(actionId, input.params);

  try {
    const preview = await previewOpsAction(actionId, params);
    const previewToken = definition.requirePreview
      ? issueOpsActionPreviewToken(actionId, params)
      : "";

    return {
      kind: "completed",
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
    };
  } catch (error) {
    return {
      kind: "internal-error",
      message: error instanceof Error ? error.message : "preview 실행 실패",
    };
  }
}
