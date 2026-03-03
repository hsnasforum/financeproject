import { createDraft, type DraftV1 } from "../drafts/draftStore";
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

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function isValidYm(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}$/u.test(value.trim());
}

function normalizeSource(value: unknown): { kind: "csv"; filename?: string; sha256?: string } {
  if (!isRecord(value) || value.kind !== "csv") return { kind: "csv" };
  const filename = asString(value.filename);
  const sha256 = asString(value.sha256).toLowerCase();
  return {
    kind: "csv",
    ...(filename ? { filename: filename.slice(0, 255) } : {}),
    ...(/^[a-f0-9]{8,64}$/u.test(sha256) ? { sha256 } : {}),
  };
}

function normalizeMeta(value: unknown): { rows: number; columns: number } {
  if (!isRecord(value)) return { rows: 0, columns: 0 };
  return {
    rows: Math.max(0, asNumber(value.rows)),
    columns: Math.max(0, asNumber(value.columns)),
  };
}

function normalizePayload(value: unknown): {
  cashflow: Array<{
    ym: string;
    incomeKrw: number;
    expenseKrw: number;
    netKrw: number;
    txCount: number;
  }>;
  draftPatch: Record<string, unknown>;
} {
  if (!isRecord(value)) {
    throw new SaveDraftFromImportInputError("draft payload가 필요합니다.");
  }

  if (!Array.isArray(value.cashflow)) {
    throw new SaveDraftFromImportInputError("cashflow 배열이 필요합니다.");
  }
  if (!isRecord(value.draftPatch)) {
    throw new SaveDraftFromImportInputError("draftPatch 객체가 필요합니다.");
  }

  const cashflow = value.cashflow
    .map((row) => {
      if (!isRecord(row) || !isValidYm(row.ym)) return null;
      return {
        ym: row.ym.trim(),
        incomeKrw: asNumber(row.incomeKrw),
        expenseKrw: asNumber(row.expenseKrw),
        netKrw: asNumber(row.netKrw),
        txCount: Math.max(0, asNumber(row.txCount)),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => a.ym.localeCompare(b.ym));

  if (cashflow.length < 1) {
    throw new SaveDraftFromImportInputError("유효한 월별 cashflow가 필요합니다.");
  }

  const payload = {
    cashflow,
    draftPatch: value.draftPatch,
  };
  assertNoForbiddenDraftKeys(payload);
  return payload;
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
  const payload = normalizePayload(input.payload);
  const source = normalizeSource(input.source);
  const meta = normalizeMeta(input.meta);

  const created = await createDraft({
    source,
    payload,
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
