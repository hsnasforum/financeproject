import { type NormalizedOption, type NormalizedProduct } from "./types";

function isValidRate(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function deriveBestFromOptions(options: NormalizedOption[]): NormalizedProduct["best"] | undefined {
  let selected: NormalizedOption | undefined;
  let selectedRate = -Infinity;

  for (const option of options) {
    const candidate = option.intr_rate2 ?? option.intr_rate;
    if (!isValidRate(candidate)) continue;
    if (!selected || candidate > selectedRate) {
      selected = option;
      selectedRate = candidate;
    }
  }

  if (!selected) return undefined;

  const intrRate = selected.intr_rate ?? null;
  return {
    save_trm: selected.save_trm,
    intr_rate: intrRate,
    intr_rate2: selected.intr_rate2 ?? intrRate,
  };
}

export function ensureProductBest(product: NormalizedProduct): void {
  if (!product.best) {
    const derived = deriveBestFromOptions(product.options);
    if (derived) product.best = derived;
  }

  const best = product.best;
  if (!best) return;
  if ((best.intr_rate2 === null || best.intr_rate2 === undefined) && isValidRate(best.intr_rate)) {
    best.intr_rate2 = best.intr_rate;
  }
}
