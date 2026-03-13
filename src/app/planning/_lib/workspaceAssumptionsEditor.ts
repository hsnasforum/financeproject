export type AssumptionsFormModel = {
  inflationPct: number;
  expectedReturnPct: number;
  cashReturnPct: number;
  withdrawalRatePct: number;
};

export const ASSUMPTIONS_FORM_DEFAULT: AssumptionsFormModel = {
  inflationPct: 2.0,
  expectedReturnPct: 5.0,
  cashReturnPct: 2.0,
  withdrawalRatePct: 4.0,
};

export function splitAssumptionsRecord(raw: Record<string, unknown>): {
  form: AssumptionsFormModel;
  extra: Record<string, unknown>;
} {
  const knownKeys = new Set([
    "inflation",
    "expectedReturn",
    "cashReturnPct",
    "withdrawalRatePct",
    "inflationPct",
    "expectedReturnPct",
    "investReturnPct",
  ]);

  const inflationPct = typeof raw.inflationPct === "number"
    ? raw.inflationPct
    : (typeof raw.inflation === "number" ? raw.inflation : ASSUMPTIONS_FORM_DEFAULT.inflationPct);
  const expectedReturnPct = typeof raw.expectedReturnPct === "number"
    ? raw.expectedReturnPct
    : (typeof raw.expectedReturn === "number"
      ? raw.expectedReturn
      : (typeof raw.investReturnPct === "number" ? raw.investReturnPct : ASSUMPTIONS_FORM_DEFAULT.expectedReturnPct));
  const cashReturnPct = typeof raw.cashReturnPct === "number" ? raw.cashReturnPct : ASSUMPTIONS_FORM_DEFAULT.cashReturnPct;
  const withdrawalRatePct = typeof raw.withdrawalRatePct === "number" ? raw.withdrawalRatePct : ASSUMPTIONS_FORM_DEFAULT.withdrawalRatePct;

  const extra: Record<string, unknown> = {};
  Object.entries(raw).forEach(([key, value]) => {
    if (!knownKeys.has(key)) {
      extra[key] = value;
    }
  });

  return {
    form: {
      inflationPct,
      expectedReturnPct,
      cashReturnPct,
      withdrawalRatePct,
    },
    extra,
  };
}

export function assumptionsFormToRecord(
  form: AssumptionsFormModel,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  const inflationPct = Number.isFinite(form.inflationPct) ? form.inflationPct : ASSUMPTIONS_FORM_DEFAULT.inflationPct;
  const expectedReturnPct = Number.isFinite(form.expectedReturnPct)
    ? form.expectedReturnPct
    : ASSUMPTIONS_FORM_DEFAULT.expectedReturnPct;
  return {
    ...extra,
    inflationPct,
    expectedReturnPct,
    cashReturnPct: Number.isFinite(form.cashReturnPct) ? form.cashReturnPct : ASSUMPTIONS_FORM_DEFAULT.cashReturnPct,
    withdrawalRatePct: Number.isFinite(form.withdrawalRatePct) ? form.withdrawalRatePct : ASSUMPTIONS_FORM_DEFAULT.withdrawalRatePct,
    inflation: inflationPct,
    expectedReturn: expectedReturnPct,
    investReturnPct: expectedReturnPct,
  };
}

export function parseAssumptionsEditorJson(text: string):
  | { ok: true; form: AssumptionsFormModel; extra: Record<string, unknown> }
  | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const split = splitAssumptionsRecord(parsed);
    return {
      ok: true,
      form: split.form,
      extra: split.extra,
    };
  } catch {
    return {
      ok: false,
      error: "가정 JSON 파싱 실패: 형식을 확인하세요.",
    };
  }
}
