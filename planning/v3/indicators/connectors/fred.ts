import { z } from "zod";
import type { Observation, SeriesSpec } from "../contracts";
import { ObservationSchema } from "../contracts";
import { ConnectorError } from "./errors";
import type { FetchSeriesOptions, SeriesConnector } from "./types";

const FRED_BASE_URL = "https://api.stlouisfed.org/fred/series/observations";
const DEFAULT_RATE_LIMIT_RETRIES = 2;
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 200;

const FredObservationRowSchema = z.object({
  date: z.string().optional(),
  value: z.union([z.string(), z.number()]).optional(),
});

const FredResponseSchema = z.object({
  observations: z.array(FredObservationRowSchema),
});

type FredConnectorDeps = {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  sleep?: (ms: number) => Promise<void>;
  rateLimitRetries?: number;
  rateLimitBackoffMs?: number;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toSafeRetries(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_RATE_LIMIT_RETRIES;
  return Math.max(0, Math.min(2, Math.floor(value ?? 0)));
}

function toSafeBackoffMs(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_RATE_LIMIT_BACKOFF_MS;
  return Math.max(0, Math.min(2_000, Math.floor(value ?? 0)));
}

function resolveApiKey(env: NodeJS.ProcessEnv): string {
  const apiKey = asString(env.FRED_API_KEY);
  if (!apiKey) {
    throw new ConnectorError("INPUT", "fred_api_key_missing");
  }
  return apiKey;
}

function resolveSeriesId(externalId: string): string {
  const seriesId = asString(externalId);
  if (!seriesId) {
    throw new ConnectorError("INPUT", "fred_series_id_missing");
  }
  if (!/^[A-Za-z0-9._-]+$/.test(seriesId)) {
    throw new ConnectorError("INPUT", "fred_series_id_invalid");
  }
  return seriesId;
}

function normalizeDateToken(raw: string): string | null {
  const token = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(token)) return token;
  if (/^\d{8}$/.test(token)) {
    return `${token.slice(0, 4)}-${token.slice(4, 6)}-${token.slice(6, 8)}`;
  }
  return null;
}

function parseNumberToken(raw: unknown): number {
  if (typeof raw === "number") return raw;
  const token = asString(raw);
  if (!token || token === ".") return Number.NaN;
  return Number(token.replaceAll(",", ""));
}

function normalizeObservations(payload: unknown): Observation[] {
  const parsed = FredResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ConnectorError("PARSE", "fred_payload_invalid");
  }

  const byDate = new Map<string, Observation>();
  for (const row of parsed.data.observations) {
    const date = normalizeDateToken(asString(row.date));
    const value = parseNumberToken(row.value);
    if (!date || !Number.isFinite(value)) continue;
    byDate.set(date, ObservationSchema.parse({ date, value }));
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function buildFredUrl(seriesId: string, asOfDate: string): string {
  const url = new URL(FRED_BASE_URL);
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("observation_end", asOfDate);
  url.searchParams.set("sort_order", "asc");
  return url.toString();
}

async function defaultSleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function createFredConnector(deps: FredConnectorDeps = {}): SeriesConnector {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const env = deps.env ?? process.env;
  const sleep = deps.sleep ?? defaultSleep;
  const rateLimitRetries = toSafeRetries(deps.rateLimitRetries);
  const rateLimitBackoffMs = toSafeBackoffMs(deps.rateLimitBackoffMs);

  return {
    sourceType: "fred",
    async fetchSeries(spec: SeriesSpec, options: FetchSeriesOptions) {
      const apiKey = resolveApiKey(env);
      const seriesId = resolveSeriesId(spec.externalId);
      const asOfDate = options.asOf.toISOString().slice(0, 10);
      const requestUrl = buildFredUrl(seriesId, asOfDate);

      const maxAttempts = rateLimitRetries + 1;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let response: Response;
        try {
          response = await fetchImpl(requestUrl, {
            method: "GET",
            headers: {
              accept: "application/json",
              authorization: `Bearer ${apiKey}`,
            },
            cache: "no-store",
          });
        } catch {
          throw new ConnectorError("FETCH", "fred_request_failed");
        }

        if (response.status === 429) {
          if (attempt < maxAttempts) {
            await sleep(rateLimitBackoffMs * attempt);
            continue;
          }
          throw new ConnectorError("LIMIT", "fred_rate_limited");
        }

        if (!response.ok) {
          throw new ConnectorError("FETCH", `fred_http_${response.status}`);
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          throw new ConnectorError("PARSE", "fred_json_parse_failed");
        }

        const observations = normalizeObservations(payload);
        return {
          observations,
          meta: {
            sourceId: spec.sourceId,
            externalId: spec.externalId,
            frequency: spec.frequency,
            units: spec.units,
            transform: spec.transform,
            notes: spec.notes,
          },
        };
      }

      throw new ConnectorError("INTERNAL", "fred_retry_exhausted");
    },
  };
}

export const fredConnector = createFredConnector();
