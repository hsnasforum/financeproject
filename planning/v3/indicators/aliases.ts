const SERIES_ID_ALIASES: Record<string, string> = {
  KR_BOK_BASE_RATE: "kr_base_rate",
  KR_BASE_RATE: "kr_base_rate",
  KR_GOV_BOND_3Y: "kr_gov_bond_3y",
  KR_CPI: "kr_cpi",
  KR_CORE_CPI: "kr_core_cpi",
  KR_USDKRW: "kr_usdkrw",
  KR_CAB: "kr_cab",
  KR_IP: "kr_ip",
  KR_EXPORTS: "kr_exports",
  KR_CB_SPREAD_AA: "kr_cb_spread_aa",
  WTI: "wti_oil",
  BRENT_OIL: "brent_oil",
};

function toSnakeCase(value: string): string {
  return value
    .trim()
    .replace(/[\s\-./]+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

export function normalizeSeriesId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const alias = SERIES_ID_ALIASES[trimmed] ?? SERIES_ID_ALIASES[trimmed.toUpperCase()];
  if (alias) return alias;
  return toSnakeCase(trimmed);
}

export function getSeriesAliasMap(): Record<string, string> {
  return { ...SERIES_ID_ALIASES };
}
