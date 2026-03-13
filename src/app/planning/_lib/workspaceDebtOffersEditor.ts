export type DebtOfferFormRow = {
  rowId: string;
  liabilityId: string;
  title: string;
  newAprPct: number;
  feeKrw: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function parseDebtOffersFormRows(raw: unknown): DebtOfferFormRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row, index) => {
    const record = asRecord(row);
    return {
      rowId: `offer-${index + 1}`,
      liabilityId: String(record.liabilityId ?? "").trim(),
      title: String(record.title ?? "").trim(),
      newAprPct: typeof record.newAprPct === "number" ? record.newAprPct : 0,
      feeKrw: typeof record.feeKrw === "number" ? record.feeKrw : 0,
    };
  });
}

export function debtOfferRowsToPayload(rows: DebtOfferFormRow[]): Array<Record<string, unknown>> {
  return rows
    .map((row) => ({
      liabilityId: row.liabilityId.trim(),
      newAprPct: row.newAprPct,
      feeKrw: row.feeKrw,
      ...(row.title.trim() ? { title: row.title.trim() } : {}),
    }))
    .filter((row) => row.liabilityId.length > 0);
}

export function parseDebtOffersEditorJson(text: string):
  | { ok: true; rows: DebtOfferFormRow[] }
  | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(text) as unknown[];
    return {
      ok: true,
      rows: parseDebtOffersFormRows(parsed),
    };
  } catch {
    return {
      ok: false,
      error: "리파이낸스 제안 JSON 파싱 실패: 형식을 확인하세요.",
    };
  }
}
