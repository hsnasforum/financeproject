export type DepositProtectionMode = "any" | "prefer" | "require";

type WithDepositSignal = {
  signals?: {
    depositProtection?: "matched" | "unknown";
  };
};

export function applyDepositProtectionOnViews<T extends WithDepositSignal>(input: {
  items: T[];
  mode: DepositProtectionMode;
}): T[] {
  void input.mode;
  return input.items;
}

export type CanonicalIntegratedItem = {
  badges?: string[];
  signals?: {
    depositProtection?: "matched" | "unknown";
    kdbMatched?: boolean;
  };
};

export function integrateCanonicalWithMatches<T extends CanonicalIntegratedItem>(input: {
  canonicalItems: T[];
  isKdbMatched: (item: T) => boolean;
  kdbOnlyItems?: T[];
}): { items: T[]; extras?: { kdbOnly?: T[] } } {
  const withSignals = input.canonicalItems.map((item) => {
    const signals: NonNullable<T["signals"]> = {
      kdbMatched: input.isKdbMatched(item),
    };
    const badges = new Set<string>(item.badges ?? ["FINLIFE"]);
    if (signals.kdbMatched) badges.add("KDB_MATCHED");
    return {
      ...item,
      signals,
      badges: [...badges],
    };
  });

  const items = applyDepositProtectionOnViews({
    items: withSignals,
    mode: "any",
  });

  if (!input.kdbOnlyItems) return { items };
  return {
    items,
    extras: { kdbOnly: input.kdbOnlyItems },
  };
}
