function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeKey(key: string): string {
  return key.replace(/[_\-\s]/g, "").toLowerCase();
}

function pickValue(obj: Record<string, unknown>, keys: string[]): unknown {
  const normalized = new Map<string, unknown>();
  for (const [key, value] of Object.entries(obj)) {
    normalized.set(normalizeKey(key), value);
  }
  for (const key of keys) {
    const hit = normalized.get(normalizeKey(key));
    if (hit !== undefined && hit !== null && String(hit).trim() !== "") return hit;
  }
  return undefined;
}

function parseNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const num = Number(String(value).trim());
  return Number.isFinite(num) ? num : undefined;
}

function parseString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const rendered = String(value).trim();
  return rendered ? rendered : undefined;
}

export function extractPagingMeta(raw: unknown): {
  totalCount?: number;
  nowPage?: number;
  maxPage?: number;
  errCd?: string;
  errMsg?: string;
} {
  const root = asRecord(raw);
  const result = asRecord(root.result);

  const totalCount = parseNumber(
    pickValue(result, ["total_count", "totalCount", "total_cnt", "tot_cnt", "list_total_count"]),
  );
  const nowPage = parseNumber(
    pickValue(result, ["now_page_no", "nowPageNo", "page_no", "pageNo", "current_page_no"]),
  );
  const maxPage = parseNumber(
    pickValue(result, ["max_page_no", "maxPageNo", "total_page_no", "totalPageNo", "last_page_no"]),
  );

  const errCd = parseString(
    pickValue(root, ["err_cd", "errCd", "error_cd", "errorCode"]) ??
      pickValue(result, ["err_cd", "errCd", "error_cd", "errorCode"]),
  );
  const errMsg = parseString(
    pickValue(root, ["err_msg", "errMsg", "error_msg", "errorMessage"]) ??
      pickValue(result, ["err_msg", "errMsg", "error_msg", "errorMessage"]),
  );

  return { totalCount, nowPage, maxPage, errCd, errMsg };
}
