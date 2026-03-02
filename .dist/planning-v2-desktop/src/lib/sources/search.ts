import { normalizeName } from "./matching";

export type QueryMode = "contains" | "prefix";

export function normalizeSearchQuery(input: string): string {
  return normalizeName(input);
}

export function buildNormFilter(fields: string[], qNorm: string, qMode: QueryMode): Record<string, unknown> {
  if (!qNorm || qNorm.length < 2) return {};
  const op = qMode === "prefix" ? "startsWith" : "contains";
  return {
    OR: fields.map((field) => ({
      [field]: { [op]: qNorm },
    })),
  };
}
