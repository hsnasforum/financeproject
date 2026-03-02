export type Gov24OrgType = "all" | "central" | "local" | "public" | "education";

function normalize(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

export function classifyOrgType(orgName?: string): Exclude<Gov24OrgType, "all"> {
  const text = normalize(orgName ?? "");
  if (!text) return "public";
  if (text.includes("교육청")) return "education";
  if (
    text.includes("특별자치시") || text.includes("특별자치도") || text.includes("광역시") || text.endsWith("시청") ||
    text.endsWith("도청") || text.endsWith("군청") || text.endsWith("구청") || text.includes("주민센터")
  ) {
    return "local";
  }
  if (
    text.endsWith("부") || text.endsWith("처") || text.endsWith("청") || text.endsWith("위원회") ||
    text.includes("보건복지부") || text.includes("고용노동부") || text.includes("국세청")
  ) {
    return "central";
  }
  return "public";
}

export function buildOrgTypeCounts<T extends { org?: string }>(items: T[]): Record<Exclude<Gov24OrgType, "all">, number> {
  const counts = { central: 0, local: 0, public: 0, education: 0 };
  for (const item of items) {
    counts[classifyOrgType(item.org)] += 1;
  }
  return counts;
}

