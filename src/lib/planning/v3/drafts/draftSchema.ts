import { z } from "zod";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asFiniteRoundedNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return null;
}

export const DraftSplitModeSchema = z.enum(["fixed", "byCategory"]);

export const DraftSourceSchema = z.object({
  kind: z.literal("csv"),
  filename: z.string().min(1).max(255).optional(),
  sha256: z.string().regex(/^[a-f0-9]{8,64}$/u).optional(),
}).strict();

export const DraftMetaSchema = z.object({
  rowsParsed: z.number().int().nonnegative(),
  columnsCount: z.number().int().nonnegative(),
  warningsCount: z.number().int().nonnegative(),
}).strict();

export const DraftMonthlyCashflowRowSchema = z.object({
  ym: z.string().regex(/^\d{4}-\d{2}$/u),
  incomeKrw: z.number().int(),
  expenseKrw: z.number().int(),
  netKrw: z.number().int(),
  txCount: z.number().int().nonnegative(),
}).strict();

export const DraftPatchSchema = z.object({
  monthlyIncomeNet: z.number().int(),
  monthlyEssentialExpenses: z.number().int(),
  monthlyDiscretionaryExpenses: z.number().int(),
  includeTransfers: z.boolean().optional(),
  splitMode: DraftSplitModeSchema.optional(),
}).strict();

export const DraftRecordSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  source: DraftSourceSchema,
  meta: DraftMetaSchema,
  monthlyCashflow: z.array(DraftMonthlyCashflowRowSchema),
  draftPatch: DraftPatchSchema,
}).strict();

export type DraftSource = z.infer<typeof DraftSourceSchema>;
export type DraftMeta = z.infer<typeof DraftMetaSchema>;
export type DraftMonthlyCashflowRow = z.infer<typeof DraftMonthlyCashflowRowSchema>;
export type DraftPatch = z.infer<typeof DraftPatchSchema>;
export type DraftRecord = z.infer<typeof DraftRecordSchema>;

type NormalizedResult<T> = {
  value: T;
  droppedWarnings: number;
};

export type NormalizedDraftPayload = NormalizedResult<{
  monthlyCashflow: DraftMonthlyCashflowRow[];
  draftPatch: DraftPatch;
}> & {
  hasCashflow: boolean;
  hasDraftPatch: boolean;
};

export function normalizeDraftSource(value: unknown): NormalizedResult<DraftSource> {
  if (!isRecord(value) || value.kind !== "csv") {
    return {
      value: DraftSourceSchema.parse({ kind: "csv" }),
      droppedWarnings: isRecord(value) ? Object.keys(value).length : 0,
    };
  }

  const allowedKeys = new Set(["kind", "filename", "sha256"]);
  let droppedWarnings = Object.keys(value).filter((key) => !allowedKeys.has(key)).length;
  const filename = asString(value.filename);
  const sha256 = asString(value.sha256).toLowerCase();

  const normalized = {
    kind: "csv" as const,
    ...(filename ? { filename: filename.slice(0, 255) } : {}),
    ...(/^[a-f0-9]{8,64}$/u.test(sha256) ? { sha256 } : {}),
  };

  if (value.sha256 !== undefined && !/^[a-f0-9]{8,64}$/u.test(sha256)) droppedWarnings += 1;
  return {
    value: DraftSourceSchema.parse(normalized),
    droppedWarnings,
  };
}

export function normalizeDraftMeta(value: unknown, extraWarnings = 0): DraftMeta {
  if (!isRecord(value)) {
    return DraftMetaSchema.parse({
      rowsParsed: 0,
      columnsCount: 0,
      warningsCount: Math.max(0, Math.trunc(extraWarnings)),
    });
  }

  const allowedKeys = new Set(["rowsParsed", "columnsCount", "warningsCount", "rows", "columns"]);
  let droppedWarnings = Object.keys(value).filter((key) => !allowedKeys.has(key)).length;

  const rowsRaw = asFiniteRoundedNumber(value.rowsParsed ?? value.rows);
  const columnsRaw = asFiniteRoundedNumber(value.columnsCount ?? value.columns);
  const warningsRaw = asFiniteRoundedNumber(value.warningsCount);

  if (rowsRaw === null && (value.rowsParsed !== undefined || value.rows !== undefined)) droppedWarnings += 1;
  if (columnsRaw === null && (value.columnsCount !== undefined || value.columns !== undefined)) droppedWarnings += 1;
  if (warningsRaw === null && value.warningsCount !== undefined) droppedWarnings += 1;

  return DraftMetaSchema.parse({
    rowsParsed: Math.max(0, rowsRaw ?? 0),
    columnsCount: Math.max(0, columnsRaw ?? 0),
    warningsCount: Math.max(0, (warningsRaw ?? 0) + extraWarnings + droppedWarnings),
  });
}

export function normalizeDraftPayload(value: unknown): NormalizedDraftPayload {
  if (!isRecord(value)) {
    return {
      value: {
        monthlyCashflow: [],
        draftPatch: DraftPatchSchema.parse({
          monthlyIncomeNet: 0,
          monthlyEssentialExpenses: 0,
          monthlyDiscretionaryExpenses: 0,
        }),
      },
      droppedWarnings: 0,
      hasCashflow: false,
      hasDraftPatch: false,
    };
  }

  const allowedTopKeys = new Set(["monthlyCashflow", "cashflow", "draftPatch"]);
  let droppedWarnings = Object.keys(value).filter((key) => !allowedTopKeys.has(key)).length;

  const cashflowInput = value.monthlyCashflow ?? value.cashflow;
  const hasCashflow = Array.isArray(cashflowInput);
  const cashflowRows: DraftMonthlyCashflowRow[] = [];
  const allowedCashflowKeys = new Set(["ym", "incomeKrw", "expenseKrw", "netKrw", "txCount"]);
  if (Array.isArray(cashflowInput)) {
    for (const row of cashflowInput) {
      if (!isRecord(row)) {
        droppedWarnings += 1;
        continue;
      }
      droppedWarnings += Object.keys(row).filter((key) => !allowedCashflowKeys.has(key)).length;
      const ym = asString(row.ym);
      if (!/^\d{4}-\d{2}$/u.test(ym)) {
        if (row.ym !== undefined) droppedWarnings += 1;
        continue;
      }

      const incomeRaw = asFiniteRoundedNumber(row.incomeKrw);
      const expenseRaw = asFiniteRoundedNumber(row.expenseKrw);
      const netRaw = asFiniteRoundedNumber(row.netKrw);
      const txCountRaw = asFiniteRoundedNumber(row.txCount);

      if (incomeRaw === null && row.incomeKrw !== undefined) droppedWarnings += 1;
      if (expenseRaw === null && row.expenseKrw !== undefined) droppedWarnings += 1;
      if (netRaw === null && row.netKrw !== undefined) droppedWarnings += 1;
      if (txCountRaw === null && row.txCount !== undefined) droppedWarnings += 1;

      cashflowRows.push(DraftMonthlyCashflowRowSchema.parse({
        ym,
        incomeKrw: incomeRaw ?? 0,
        expenseKrw: expenseRaw ?? 0,
        netKrw: netRaw ?? 0,
        txCount: Math.max(0, txCountRaw ?? 0),
      }));
    }
  } else if (cashflowInput !== undefined) {
    droppedWarnings += 1;
  }
  cashflowRows.sort((left, right) => left.ym.localeCompare(right.ym));

  const patchInput = isRecord(value.draftPatch) ? value.draftPatch : {};
  const hasDraftPatch = isRecord(value.draftPatch);
  const allowedPatchKeys = new Set([
    "monthlyIncomeNet",
    "monthlyEssentialExpenses",
    "monthlyDiscretionaryExpenses",
    "includeTransfers",
    "splitMode",
  ]);
  droppedWarnings += Object.keys(patchInput).filter((key) => !allowedPatchKeys.has(key)).length;

  const incomeRaw = asFiniteRoundedNumber(patchInput.monthlyIncomeNet);
  const essentialRaw = asFiniteRoundedNumber(patchInput.monthlyEssentialExpenses);
  const discretionaryRaw = asFiniteRoundedNumber(patchInput.monthlyDiscretionaryExpenses);
  if (incomeRaw === null && patchInput.monthlyIncomeNet !== undefined) droppedWarnings += 1;
  if (essentialRaw === null && patchInput.monthlyEssentialExpenses !== undefined) droppedWarnings += 1;
  if (discretionaryRaw === null && patchInput.monthlyDiscretionaryExpenses !== undefined) droppedWarnings += 1;

  const includeTransfers = patchInput.includeTransfers;
  const splitMode = asString(patchInput.splitMode);
  if (includeTransfers !== undefined && typeof includeTransfers !== "boolean") droppedWarnings += 1;
  if (
    patchInput.splitMode !== undefined
    && !(splitMode === "fixed" || splitMode === "byCategory")
  ) {
    droppedWarnings += 1;
  }

  const patch = DraftPatchSchema.parse({
    monthlyIncomeNet: incomeRaw ?? 0,
    monthlyEssentialExpenses: essentialRaw ?? 0,
    monthlyDiscretionaryExpenses: discretionaryRaw ?? 0,
    ...(typeof includeTransfers === "boolean" ? { includeTransfers } : {}),
    ...(splitMode === "fixed" || splitMode === "byCategory" ? { splitMode } : {}),
  });

  return {
    value: {
      monthlyCashflow: cashflowRows,
      draftPatch: patch,
    },
    droppedWarnings,
    hasCashflow,
    hasDraftPatch,
  };
}
