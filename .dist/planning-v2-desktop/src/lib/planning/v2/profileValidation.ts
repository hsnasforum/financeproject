import { formatExpectedDebtIds, validateDebtOfferLiabilityIds } from "./debtOfferMapping";

export type ProfileValidationIssue = {
  code: "DEBT_ID_DUPLICATE" | "DEBT_OFFER_ID_MISMATCH";
  path: string;
  message: string;
};

type CanonicalDebt = {
  id?: unknown;
};

type CanonicalOffer = {
  liabilityId?: unknown;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function validateProfile(
  profile: { debts?: CanonicalDebt[] },
  options?: { offers?: CanonicalOffer[] },
): ProfileValidationIssue[] {
  const debts = Array.isArray(profile.debts) ? profile.debts : [];
  const offers = Array.isArray(options?.offers) ? options.offers : [];
  const issues: ProfileValidationIssue[] = [];

  const seen = new Set<string>();
  const debtIds: string[] = [];
  debts.forEach((debt, index) => {
    const id = asString(debt.id);
    if (!id) return;
    if (seen.has(id)) {
      issues.push({
        code: "DEBT_ID_DUPLICATE",
        path: `debts[${index}].id`,
        message: `duplicate debt id: ${id}`,
      });
      return;
    }
    seen.add(id);
    debtIds.push(id);
  });

  const mapping = validateDebtOfferLiabilityIds(
    offers.map((offer) => ({ liabilityId: asString(offer.liabilityId) })),
    debtIds,
  );
  if (!mapping.ok) {
    issues.push({
      code: "DEBT_OFFER_ID_MISMATCH",
      path: "offers",
      message: `liabilityId must match debts ids (expected ids: ${formatExpectedDebtIds(mapping.expectedIds)}, mismatched: ${mapping.mismatchedIds.join(", ") || "(empty)"})`,
    });
  }

  return issues;
}
