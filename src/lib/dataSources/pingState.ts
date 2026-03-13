export type PingSourceName =
  | "exim_exchange"
  | "mois_benefits"
  | "reb_subscription"
  | "finlife"
  | "molit_sales"
  | "molit_rent";

export type DataSourcePingTone = "ok" | "error";

export type DataSourcePingDetail = {
  label: string;
  value: string;
};

export type DataSourcePingSnapshot = {
  source: PingSourceName;
  tone: DataSourcePingTone;
  text: string;
  fetchedAt: string;
  summaryText?: string;
  details?: DataSourcePingDetail[];
  statusLabel?: "정상" | "주의";
};

const STORAGE_PREFIX = "data-source-ping:v1:";
export const DATA_SOURCE_PING_UPDATED_EVENT = "data-source-ping-updated";

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pushSummaryPart(parts: string[], label: string, value: string | null) {
  if (!value) return;
  parts.push(`${label}${value}`);
}

export function formatDataSourcePingSummary(summary: Record<string, unknown> | undefined): string {
  if (!summary) return "연결 성공";
  const parts: string[] = [];
  pushSummaryPart(parts, "기준일 ", asNonEmptyString(summary.asOf));

  const rateCount = asFiniteNumber(summary.rateCount);
  if (rateCount !== null) parts.push(`${rateCount}개 통화`);

  const count = asFiniteNumber(summary.count);
  if (count !== null) parts.push(`${count}건`);

  const month = asNonEmptyString(summary.month);
  if (month) parts.push(`${month} 데이터`);

  pushSummaryPart(parts, "mode=", asNonEmptyString(summary.mode));
  pushSummaryPart(parts, "", asNonEmptyString(summary.endpointPath));
  pushSummaryPart(parts, "resolved=", asNonEmptyString(summary.resolvedFrom));
  pushSummaryPart(parts, "auth=", asNonEmptyString(summary.authMode));

  const scannedPages = asFiniteNumber(summary.scannedPages);
  if (scannedPages !== null) parts.push(`pages=${scannedPages}`);

  const scannedRows = asFiniteNumber(summary.scannedRows);
  if (scannedRows !== null) parts.push(`rows=${scannedRows}`);

  const matchedRows = asFiniteNumber(summary.matchedRows);
  if (matchedRows !== null) parts.push(`matched=${matchedRows}`);

  const rawMatched = asFiniteNumber(summary.rawMatched);
  if (rawMatched !== null) parts.push(`rawMatched=${rawMatched}`);

  const normalizedCount = asFiniteNumber(summary.normalizedCount);
  if (normalizedCount !== null) parts.push(`normalized=${normalizedCount}`);

  if (summary.dropStats && typeof summary.dropStats === "object") {
    const dropStats = summary.dropStats as Record<string, unknown>;
    const missingTitle = asFiniteNumber(dropStats.missingTitle);
    if (missingTitle !== null && missingTitle > 0) parts.push(`drop.missingTitle=${missingTitle}`);
  }

  return parts.length ? parts.join(" · ") : "연결 성공";
}

export function buildDataSourcePingDetails(summary: Record<string, unknown> | undefined): DataSourcePingDetail[] {
  if (!summary) return [];

  const details: DataSourcePingDetail[] = [];
  const asOf = asNonEmptyString(summary.asOf);
  if (asOf) details.push({ label: "기준일", value: asOf });

  const month = asNonEmptyString(summary.month);
  if (month) details.push({ label: "기준월", value: month });

  const rateCount = asFiniteNumber(summary.rateCount);
  if (rateCount !== null) details.push({ label: "통화 수", value: `${rateCount}개` });

  const count = asFiniteNumber(summary.count);
  if (count !== null) details.push({ label: "건수", value: `${count}건` });

  const normalizedCount = asFiniteNumber(summary.normalizedCount);
  if (normalizedCount !== null) details.push({ label: "정규화", value: `${normalizedCount}건` });

  const scannedRows = asFiniteNumber(summary.scannedRows);
  if (scannedRows !== null) details.push({ label: "스캔", value: `${scannedRows}행` });

  const matchedRows = asFiniteNumber(summary.matchedRows);
  if (matchedRows !== null) details.push({ label: "매칭", value: `${matchedRows}행` });

  const scannedPages = asFiniteNumber(summary.scannedPages);
  if (scannedPages !== null) details.push({ label: "페이지", value: `${scannedPages}p` });

  const mode = asNonEmptyString(summary.mode);
  if (mode) details.push({ label: "조회 모드", value: mode });

  const endpointPath = asNonEmptyString(summary.endpointPath);
  if (endpointPath) details.push({ label: "경로", value: endpointPath });

  const resolvedFrom = asNonEmptyString(summary.resolvedFrom);
  if (resolvedFrom) details.push({ label: "해석 기준", value: resolvedFrom });

  const authMode = asNonEmptyString(summary.authMode);
  if (authMode) details.push({ label: "인증", value: authMode });

  return details;
}

function normalizeFetchedAt(fetchedAt: unknown): string | null {
  const raw = asNonEmptyString(fetchedAt);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function extractSummaryText(text: string): string {
  return text.replace(/^연결 (OK|주의) · /, "").trim();
}

export function createDataSourcePingSnapshot(input: {
  source: PingSourceName;
  success: boolean;
  fetchedAt: unknown;
  summary?: Record<string, unknown>;
}): DataSourcePingSnapshot | null {
  const fetchedAt = normalizeFetchedAt(input.fetchedAt);
  if (!fetchedAt) return null;

  const tone: DataSourcePingTone = input.success ? "ok" : "error";
  const summaryText = formatDataSourcePingSummary(input.summary);
  const text = `${input.success ? "연결 OK" : "연결 주의"} · ${summaryText}`;

  return {
    source: input.source,
    tone,
    text,
    fetchedAt,
    summaryText,
    details: buildDataSourcePingDetails(input.summary),
    statusLabel: input.success ? "정상" : "주의",
  };
}

export function getDataSourcePingStorageKey(sourceId: string): string {
  return `${STORAGE_PREFIX}${sourceId}`;
}

export function parseDataSourcePingSnapshot(raw: string | null): DataSourcePingSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const source = typeof parsed.source === "string" ? parsed.source : "";
    const tone = parsed.tone === "ok" || parsed.tone === "error" ? parsed.tone : null;
    const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
    const fetchedAt = normalizeFetchedAt(parsed.fetchedAt);
    if (!source || !tone || !text || !fetchedAt) return null;

    const detailsRaw = Array.isArray(parsed.details) ? parsed.details : [];
    const details = detailsRaw
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const item = entry as Record<string, unknown>;
        const label = asNonEmptyString(item.label);
        const value = asNonEmptyString(item.value);
        if (!label || !value) return null;
        return { label, value } satisfies DataSourcePingDetail;
      })
      .filter((entry): entry is DataSourcePingDetail => entry !== null);

    const summaryText = asNonEmptyString(parsed.summaryText) ?? extractSummaryText(text);
    const statusLabelRaw = asNonEmptyString(parsed.statusLabel);
    const statusLabel = statusLabelRaw === "정상" || statusLabelRaw === "주의"
      ? statusLabelRaw
      : tone === "ok"
        ? "정상"
        : "주의";

    return {
      source: source as PingSourceName,
      tone,
      text,
      fetchedAt,
      summaryText,
      ...(details.length > 0 ? { details } : {}),
      statusLabel,
    };
  } catch {
    return null;
  }
}

export function stringifyDataSourcePingSnapshot(snapshot: DataSourcePingSnapshot): string {
  return JSON.stringify(snapshot);
}
