import { FinlifeIntegrityError, finlifeIdentity } from "@/lib/finlife/identity.mjs";

type StoredFinlifeProduct = {
  identityKey?: string | null;
  kind: string;
  finPrdtCd: string;
  raw?: unknown;
  provider?: { code?: string } | null;
};

/** Legacy rows remain readable; only complete metadata can establish a scoped identity. */
export function storedFinlifeIdentity(row: StoredFinlifeProduct): string {
  const stored = row.identityKey?.trim();
  if (stored) return stored;
  const raw = row.raw && typeof row.raw === "object" && !Array.isArray(row.raw)
    ? row.raw as Record<string, unknown>
    : {};
  try {
    return finlifeIdentity(row.kind, {
      ...raw,
      fin_co_no: raw.fin_co_no ?? row.provider?.code,
      fin_prdt_cd: row.finPrdtCd,
    });
  } catch (error) {
    if (!(error instanceof FinlifeIntegrityError)) throw error;
    return row.finPrdtCd;
  }
}
