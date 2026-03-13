export function normalizeDartCorpCode(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  return /^\d{8}$/.test(raw) ? raw : "";
}

export function normalizeDartSearchQuery(value: unknown, maxLength = 80): string {
  const raw = typeof value === "string" ? value : "";
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.slice(0, maxLength);
}

export function normalizeDartCorpName(value: unknown, maxLength = 120): string {
  return normalizeDartSearchQuery(value, maxLength);
}

export function buildDartSearchHref(query?: unknown, tab?: unknown): string {
  const normalized = normalizeDartSearchQuery(query);
  const normalizedTab = tab === "monitor" ? "monitor" : "";
  const pairs: string[] = [];
  if (normalized) pairs.push(`q=${encodeURIComponent(normalized)}`);
  if (normalizedTab) pairs.push(`tab=${encodeURIComponent(normalizedTab)}`);
  return pairs.length > 0 ? `/public/dart?${pairs.join("&")}` : "/public/dart";
}

export function buildDartCompanyHref(corpCode: unknown, fromQuery?: unknown, corpName?: unknown): string {
  const normalizedCorpCode = normalizeDartCorpCode(corpCode);
  if (!normalizedCorpCode) return buildDartSearchHref(fromQuery);
  const normalizedQuery = normalizeDartSearchQuery(fromQuery);
  const normalizedCorpName = normalizeDartCorpName(corpName);
  const pairs = [`corpCode=${encodeURIComponent(normalizedCorpCode)}`];
  if (normalizedQuery) {
    pairs.push(`fromQuery=${encodeURIComponent(normalizedQuery)}`);
  }
  if (normalizedCorpName) {
    pairs.push(`corpName=${encodeURIComponent(normalizedCorpName)}`);
  }
  return `/public/dart/company?${pairs.join("&")}`;
}

export function buildDartMonitorHref(corpCode?: unknown, corpName?: unknown): string {
  const normalizedCorpCode = normalizeDartCorpCode(corpCode);
  const normalizedCorpName = normalizeDartCorpName(corpName);
  if (!normalizedCorpCode) return buildDartSearchHref(undefined, "monitor");

  const pairs = [
    `tab=${encodeURIComponent("monitor")}`,
    `corpCode=${encodeURIComponent(normalizedCorpCode)}`,
  ];
  if (normalizedCorpName) {
    pairs.push(`corpName=${encodeURIComponent(normalizedCorpName)}`);
  }
  return `/public/dart?${pairs.join("&")}`;
}
