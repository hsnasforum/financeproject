import { createDraft, type DraftV1 } from "../drafts/draftStore";
import {
  normalizeDraftMeta,
  normalizeDraftPayload,
  normalizeDraftSource,
} from "../drafts/draftSchema";
import { ForbiddenDraftKeyError, assertNoForbiddenDraftKeys } from "./forbiddenDraftKeys";

type SaveDraftFromImportInput = {
  source?: unknown;
  payload?: unknown;
  meta?: unknown;
};

type SaveDraftFromImportResult = Pick<DraftV1, "id" | "createdAt" | "source" | "meta">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export class SaveDraftFromImportInputError extends Error {
  readonly code = "INPUT";

  constructor(message: string) {
    super(message);
    this.name = "SaveDraftFromImportInputError";
  }
}

export function isSaveDraftFromImportInputError(error: unknown): error is SaveDraftFromImportInputError {
  return error instanceof SaveDraftFromImportInputError;
}

export async function saveDraftFromImport(input: SaveDraftFromImportInput): Promise<SaveDraftFromImportResult> {
  if (!isRecord(input.payload)) {
    throw new SaveDraftFromImportInputError("draft payload가 필요합니다.");
  }

  const payloadNormalized = normalizeDraftPayload(input.payload);
  if (!payloadNormalized.hasCashflow) {
    throw new SaveDraftFromImportInputError("cashflow 배열이 필요합니다.");
  }
  if (!payloadNormalized.hasDraftPatch) {
    throw new SaveDraftFromImportInputError("draftPatch 객체가 필요합니다.");
  }
  if (payloadNormalized.value.monthlyCashflow.length < 1) {
    throw new SaveDraftFromImportInputError("유효한 월별 cashflow가 필요합니다.");
  }

  const sourceNormalized = normalizeDraftSource(input.source);
  const droppedWarnings = payloadNormalized.droppedWarnings + sourceNormalized.droppedWarnings;
  const meta = normalizeDraftMeta(input.meta, droppedWarnings);
  const payload = payloadNormalized.value;
  const source = sourceNormalized.value;
  assertNoForbiddenDraftKeys(payload);

  const created = await createDraft({
    source,
    monthlyCashflow: payload.monthlyCashflow,
    draftPatch: payload.draftPatch,
    meta,
  });

  const result: SaveDraftFromImportResult = {
    id: created.id,
    createdAt: created.createdAt,
    source: created.source,
    meta: created.meta,
  };
  assertNoForbiddenDraftKeys(result);
  return result;
}

export function isSaveDraftFromImportForbiddenError(error: unknown): error is ForbiddenDraftKeyError {
  return error instanceof ForbiddenDraftKeyError;
}
