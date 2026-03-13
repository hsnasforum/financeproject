import { type RecommendedItem, type DepositProtectionMode } from "./types";

export const DEFAULT_DEPOSIT_PROTECTION_BONUS = 0.05;

export function applyDepositProtectionPolicy(input: {
  items: RecommendedItem[];
  mode: DepositProtectionMode;
  matchedFinPrdtCdSet: Set<string>;
  bonus?: number;
}): RecommendedItem[] {
  const { items, mode, matchedFinPrdtCdSet } = input;
  const bonus = typeof input.bonus === "number" ? input.bonus : DEFAULT_DEPOSIT_PROTECTION_BONUS;

  const withSignals = items.map((item) => {
    const matched = matchedFinPrdtCdSet.has(item.finPrdtCd);
    return {
      ...item,
      ...(mode === "prefer" && matched
        ? { finalScore: item.finalScore + bonus }
        : {}),
      signals: {
        ...(item.signals ?? {}),
        depositProtection: matched ? "matched" : "unknown",
      },
    } satisfies RecommendedItem;
  });

  if (mode !== "require") {
    return withSignals;
  }

  const requiredOnly = withSignals.filter((item) => item.signals?.depositProtection === "matched");
  return requiredOnly;
}
