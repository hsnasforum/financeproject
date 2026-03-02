import { normalizeAprPct, normalizeNewAprPct } from "../normalizeRates";

export type EngineRateBoundary = {
  pct: number;
  decimal: number;
};

export type DebtAprPctInput = {
  aprPct: number;
};

export type OfferAprPctInput = {
  newAprPct: number;
};

export type EngineDebtApr = {
  apr: number;
};

export type EngineOfferApr = {
  newApr: number;
};

export type CanonicalDebtAprInput = {
  aprPct?: number;
  apr?: number;
};

export type CanonicalProfileInput<TDebt extends CanonicalDebtAprInput = CanonicalDebtAprInput> = {
  debts?: TDebt[];
} & Record<string, unknown>;

function resolveAprPctInput(debt: CanonicalDebtAprInput): number {
  if (isFiniteNumber(debt.aprPct)) return debt.aprPct;
  if (isFiniteNumber(debt.apr)) return debt.apr;
  return 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function normalizeAprPctInput(value: number): number {
  if (!isFiniteNumber(value)) return 0;
  try {
    return normalizeAprPct(value, "aprPct");
  } catch {
    // keep legacy behavior for callers that only need a best-effort value
    return value;
  }
}

export function toEngineRateBoundary(aprPctInput: number, field: "aprPct" | "newAprPct" = "aprPct"): EngineRateBoundary {
  const pct = field === "newAprPct"
    ? normalizeNewAprPct(aprPctInput, field)
    : normalizeAprPct(aprPctInput, field);
  return {
    pct,
    decimal: pct / 100,
  };
}

export function decimalToAprPct(aprDecimal: number): number {
  if (!isFiniteNumber(aprDecimal)) return 0;
  return aprDecimal * 100;
}

export function normalizeForEngineRates<TDebt extends DebtAprPctInput, TOffer extends OfferAprPctInput>(input: {
  debts?: TDebt[];
  offers?: TOffer[];
}): {
  debts: Array<Omit<TDebt, "aprPct"> & EngineDebtApr>;
  offers: Array<Omit<TOffer, "newAprPct"> & EngineOfferApr>;
} {
  return {
    debts: (input.debts ?? []).map((debt) => {
      const { aprPct: _aprPct, ...rest } = debt;
      return {
        ...rest,
        apr: toEngineRateBoundary(debt.aprPct).decimal,
      };
    }),
    offers: (input.offers ?? []).map((offer) => {
      const { newAprPct: _newAprPct, ...rest } = offer;
      return {
        ...rest,
        newApr: toEngineRateBoundary(offer.newAprPct, "newAprPct").decimal,
      };
    }),
  };
}

export function toEngineProfile<TProfile extends CanonicalProfileInput>(profile: TProfile): Omit<TProfile, "debts"> & {
  debts: Array<Omit<NonNullable<TProfile["debts"]>[number], "aprPct"> & { apr: number }>;
} {
  const debts = (profile.debts ?? []).map((debt) => {
    const { aprPct: _aprPct, ...rest } = debt as CanonicalDebtAprInput & Record<string, unknown>;
    return {
      ...rest,
      apr: toEngineRateBoundary(resolveAprPctInput(debt), "aprPct").decimal,
    };
  }) as Array<Omit<NonNullable<TProfile["debts"]>[number], "aprPct"> & { apr: number }>;

  const { debts: _ignoredDebts, ...restProfile } = profile;
  return {
    ...(restProfile as Omit<TProfile, "debts">),
    debts,
  };
}
