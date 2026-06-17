import {
  getDraft as getLegacyDraft,
  type DraftV1,
} from "../drafts/draftStore";
import { type V3DraftRecord } from "../domain/draft";
import { getDraft as getProfileDraftBridge } from "../store/draftStore";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toPreviewDraft(input: DraftV1): V3DraftRecord {
  return {
    id: input.id,
    createdAt: input.createdAt,
    source: {
      kind: "csv",
      ...(asString(input.source?.filename) ? { filename: asString(input.source?.filename) } : {}),
      ...(Number.isFinite(Number(input.meta?.rowsParsed))
        ? { rows: Math.max(0, Math.trunc(Number(input.meta.rowsParsed))) }
        : {}),
      months: input.monthlyCashflow.length,
    },
    cashflow: input.monthlyCashflow,
    draftPatch: input.draftPatch as Record<string, unknown>,
    summary: {},
  };
}

export async function getCurrentUserPreviewDraft(id: string): Promise<V3DraftRecord | null> {
  const bridgeDraft = await getProfileDraftBridge(id);
  if (bridgeDraft) return bridgeDraft;

  const legacyDraft = await getLegacyDraft(id);
  return legacyDraft ? toPreviewDraft(legacyDraft) : null;
}
