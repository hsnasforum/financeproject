import { type RecommendedItem, type DepositProtectionMode } from "./types";

export const DEFAULT_DEPOSIT_PROTECTION_BONUS = 0.05;

export function applyDepositProtectionPolicy(input: {
  items: RecommendedItem[];
  mode: DepositProtectionMode;
  matchedFinPrdtCdSet: Set<string>;
  bonus?: number;
}): RecommendedItem[] {
  const { items } = input;
  void input.mode;
  void input.matchedFinPrdtCdSet;
  void input.bonus;

  return items.map((item) => ({
    ...item,
    signals: {
      ...(item.signals ?? {}),
      depositProtection: "unknown",
    },
  }));
}
