import { FinlifeIntegrityError, finlifeIdentity } from "../finlife/identity.mjs";
import type { FinlifeKind, NormalizedProduct } from "../finlife/types";

export function productIdentity(product: NormalizedProduct, kind?: FinlifeKind): string {
  if (product.identityKey?.trim()) return product.identityKey.trim();
  if (!kind) return product.fin_prdt_cd;
  try {
    return finlifeIdentity(kind, {
      ...product.raw,
      fin_co_no: product.fin_co_no ?? product.raw.fin_co_no,
      fin_prdt_cd: product.fin_prdt_cd,
    });
  } catch (error) {
    if (!(error instanceof FinlifeIntegrityError)) throw error;
    return product.fin_prdt_cd;
  }
}

/** Resolve membership without changing or guessing the scope of stored legacy IDs. */
export function resolveProductShelfIds(
  ids: ReadonlySet<string>,
  products: NormalizedProduct[],
  kind?: FinlifeKind,
): Set<string> {
  const codeCounts = new Map<string, number>();
  for (const product of products) {
    codeCounts.set(product.fin_prdt_cd, (codeCounts.get(product.fin_prdt_cd) ?? 0) + 1);
  }
  const resolved = new Set<string>();
  for (const product of products) {
    const id = productIdentity(product, kind);
    if (!ids.has(id)) continue;
    if (id === product.fin_prdt_cd && codeCounts.get(id) !== 1) continue;
    resolved.add(id);
  }
  return resolved;
}
