import { type UnifiedSourceId } from "@/lib/sources/types";

export function parseIncludeSources(input: string | string[] | null): UnifiedSourceId[] {
  const rawList = Array.isArray(input)
    ? input
    : (typeof input === "string" ? [input] : []);
  const tokens = rawList
    .flatMap((entry) => entry.split(","))
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return ["finlife"];

  const allowed: UnifiedSourceId[] = ["finlife", "datago_kdb"];
  const picked = new Set<UnifiedSourceId>();
  for (const token of tokens) {
    if ((allowed as string[]).includes(token)) {
      picked.add(token as UnifiedSourceId);
    }
  }
  return picked.size > 0 ? [...picked] : ["finlife"];
}
