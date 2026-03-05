import { ObservationSchema } from "../contracts.ts";
import { type ConnectorFetchResult, type Observation } from "../types.ts";

const FRED_BASE_URL = "https://api.stlouisfed.org/fred/series/observations";

type FredObservationRow = {
  date?: unknown;
  value?: unknown;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveApiKey(): string {
  return asString(process.env.FRED_API_KEY);
}

function normalizeDateToken(input: string): string | null {
  const token = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(token)) return token;
  if (/^\d{8}$/.test(token)) {
    return `${token.slice(0, 4)}-${token.slice(4, 6)}-${token.slice(6, 8)}`;
  }
  return null;
}

function parseNumericValue(raw: unknown): number {
  const token = asString(raw);
  if (!token || token === ".") return Number.NaN;
  return Number(token.replace(/,/g, ""));
}

function parseRows(payload: unknown): Observation[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as { observations?: unknown };
  if (!Array.isArray(root.observations)) return [];

  const byDate = new Map<string, Observation>();
  for (const row of root.observations as FredObservationRow[]) {
    const date = normalizeDateToken(asString(row.date));
    const value = parseNumericValue(row.value);
    if (!date || !Number.isFinite(value)) continue;
    byDate.set(date, ObservationSchema.parse({ date, value }));
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function buildFredUrl(input: {
  seriesId: string;
  start?: string;
  end?: string;
}): string {
  const url = new URL(FRED_BASE_URL);
  url.searchParams.set("series_id", input.seriesId);
  url.searchParams.set("file_type", "json");
  if (input.start) url.searchParams.set("observation_start", input.start);
  if (input.end) url.searchParams.set("observation_end", input.end);
  return url.toString();
}

export async function fetchFredSeries(input: {
  externalId: string;
  start?: string;
  end?: string;
  fetchImpl?: typeof fetch;
  apiKey?: string;
}): Promise<ConnectorFetchResult> {
  const apiKey = asString(input.apiKey) || resolveApiKey();
  if (!apiKey) {
    throw new Error("KEY_MISSING:FRED API key is missing");
  }

  const seriesId = asString(input.externalId);
  if (!seriesId) {
    throw new Error("INVALID_EXTERNAL_ID:FRED series_id is required");
  }

  const fetchFn = input.fetchImpl ?? fetch;
  const response = await fetchFn(buildFredUrl({
    seriesId,
    start: input.start,
    end: input.end,
  }), {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${apiKey}`,
      "user-agent": "finance-indicators-fred/1.0",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`HTTP_${response.status}:FRED request failed`);
  }

  const payload = await response.json() as unknown;
  const observations = parseRows(payload);
  const asOfDate = observations[observations.length - 1]?.date ?? new Date().toISOString().slice(0, 10);

  return {
    asOf: new Date(`${asOfDate}T00:00:00.000Z`).toISOString(),
    observations,
    cursor: observations[observations.length - 1]?.date,
    meta: {
      connector: "fred",
      seriesId,
    },
  };
}
