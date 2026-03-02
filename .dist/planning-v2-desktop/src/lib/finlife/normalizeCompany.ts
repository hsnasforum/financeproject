import { type FinlifeCompany } from "@/lib/finlife/types";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function firstString(raw: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function normalizeFinlifeCompanies(input: { baseList: unknown[] }): FinlifeCompany[] {
  const out: FinlifeCompany[] = [];

  for (const row of input.baseList) {
    const raw = asRecord(row);
    const companyId = firstString(raw, ["fin_co_no", "dcls_month", "company_id", "co_no"]);
    const companyName = firstString(raw, ["kor_co_nm", "fin_co_nm", "company_name", "co_nm"]);
    if (!companyId || !companyName) continue;

    out.push({
      companyId,
      companyName,
      groupCode: firstString(raw, ["top_fin_grp_no", "topFinGrpNo"]) || undefined,
      homepage: firstString(raw, ["homp_url", "homepage", "hompUrl"]) || undefined,
      callCenter: firstString(raw, ["cal_tel", "call_center", "callCenter"]) || undefined,
      raw,
    });
  }

  return out;
}
