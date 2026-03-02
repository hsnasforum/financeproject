type LiabilityIdRow = {
  liabilityId: string;
};

export type DebtOfferIdMappingResult = {
  ok: boolean;
  expectedIds: string[];
  mismatchedIds: string[];
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function validateDebtOfferLiabilityIds(
  offers: LiabilityIdRow[],
  debtIdsRaw: string[],
): DebtOfferIdMappingResult {
  const expectedIds = Array.from(
    new Set(
      debtIdsRaw
        .map((id) => asString(id))
        .filter((id) => id.length > 0),
    ),
  );
  const expected = new Set(expectedIds);
  const mismatchedIds = Array.from(
    new Set(
      offers
        .map((offer) => asString(offer.liabilityId))
        .filter((id) => id.length === 0 || !expected.has(id)),
    ),
  );

  return {
    ok: mismatchedIds.length < 1,
    expectedIds,
    mismatchedIds,
  };
}

export function formatExpectedDebtIds(expectedIds: string[]): string {
  return expectedIds.length > 0 ? expectedIds.join(", ") : "(none)";
}

