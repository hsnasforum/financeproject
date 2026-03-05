import type { Observation, SeriesSpec } from "../contracts";
import { ObservationSchema } from "../contracts";
import { ConnectorError } from "./errors";
import type { FetchSeriesOptions, SeriesConnector } from "./types";

const ECOS_BASE_URL = "https://ecos.bok.or.kr/api";
const DEFAULT_LIMIT_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 200;

export type EcosExternalIdParts = {
  statCode: string;
  itemCode1: string;
  itemCode2: string;
  itemCode3: string;
  cycle: string;
  start: string;
  end: string;
};

type EcosConnectorDeps = {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  sleep?: (ms: number) => Promise<void>;
  limitRetries?: number;
  backoffMs?: number;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toSafeRetries(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_LIMIT_RETRIES;
  return Math.max(0, Math.min(2, Math.floor(value ?? 0)));
}

function toSafeBackoffMs(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_BACKOFF_MS;
  return Math.max(0, Math.min(2_000, Math.floor(value ?? 0)));
}

function normalizeItemToken(value: string): string {
  const token = value.trim();
  if (!token || token === "-" || token === "_") return "?";
  return token;
}

function normalizeCycleToken(value: string): string {
  const token = value.trim().toUpperCase();
  if (token === "A") return "Y";
  return token;
}

function resolveApiKey(env: NodeJS.ProcessEnv): string {
  const key = asString(env.BOK_ECOS_API_KEY) || asString(env.ECOS_API_KEY);
  if (!key) {
    throw new ConnectorError("INPUT", "ecos_api_key_missing");
  }
  return key;
}

export function parseEcosExternalId(externalId: string): EcosExternalIdParts {
  const tokens = externalId.split("|").map((row) => row.trim());
  if (tokens.length !== 7) {
    throw new ConnectorError("INPUT", "ecos_external_id_invalid_fields");
  }

  const [statCodeRaw, item1Raw, item2Raw, item3Raw, cycleRaw, startRaw, endRaw] = tokens;
  const statCode = statCodeRaw.trim();
  const cycle = normalizeCycleToken(cycleRaw);
  const start = startRaw.trim();
  const end = endRaw.trim();

  if (!statCode) throw new ConnectorError("INPUT", "ecos_stat_code_missing");
  if (!cycle || !/^[DWMQY]$/.test(cycle)) throw new ConnectorError("INPUT", "ecos_cycle_invalid");
  if (!start || !end) throw new ConnectorError("INPUT", "ecos_date_range_missing");

  return {
    statCode,
    itemCode1: normalizeItemToken(item1Raw),
    itemCode2: normalizeItemToken(item2Raw),
    itemCode3: normalizeItemToken(item3Raw),
    cycle,
    start,
    end,
  };
}

function buildEcosUrl(parts: EcosExternalIdParts, apiKey: string): string {
  return `${ECOS_BASE_URL}/StatisticSearch/${encodeURIComponent(apiKey)}/json/kr/1/10000/${encodeURIComponent(parts.statCode)}/${encodeURIComponent(parts.cycle)}/${encodeURIComponent(parts.start)}/${encodeURIComponent(parts.end)}/${encodeURIComponent(parts.itemCode1)}/${encodeURIComponent(parts.itemCode2)}/${encodeURIComponent(parts.itemCode3)}`;
}

function normalizeEcosDate(raw: string, cycle: string): string | null {
  const token = raw.trim();
  if (!token) return null;
  if (cycle === "D" && /^\d{8}$/.test(token)) {
    return `${token.slice(0, 4)}-${token.slice(4, 6)}-${token.slice(6, 8)}`;
  }
  if (cycle === "M" && /^\d{6}$/.test(token)) {
    return `${token.slice(0, 4)}-${token.slice(4, 6)}`;
  }
  if (cycle === "Q") {
    const qMatch = token.match(/^(\d{4})Q([1-4])$/) ?? token.match(/^(\d{4})([1-4])$/);
    if (qMatch) {
      return `${qMatch[1]}-Q${qMatch[2]}`;
    }
  }
  if (cycle === "Y" && /^\d{4}$/.test(token)) {
    return token;
  }
  return null;
}

function parseNumericToken(value: unknown): number {
  const token = asString(value);
  if (!token || token === "." || token === "-") return Number.NaN;
  return Number(token.replaceAll(",", ""));
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      if (quoted && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (ch === "," && !quoted) {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current.trim());
  return out;
}

function parseCsvObservations(body: string, cycle: string): Observation[] {
  const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0] ?? "");
  const timeIndex = header.findIndex((name) => name.toUpperCase() === "TIME");
  const valueIndex = header.findIndex((name) => name.toUpperCase() === "DATA_VALUE");
  if (timeIndex < 0 || valueIndex < 0) {
    throw new ConnectorError("PARSE", "ecos_csv_header_invalid");
  }

  const byDate = new Map<string, Observation>();
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const date = normalizeEcosDate(cols[timeIndex] ?? "", cycle);
    const value = parseNumericToken(cols[valueIndex]);
    if (!date || !Number.isFinite(value)) continue;
    byDate.set(date, ObservationSchema.parse({ date, value }));
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function parseJsonObservations(payload: unknown, cycle: string): Observation[] {
  if (!isRecord(payload)) {
    throw new ConnectorError("PARSE", "ecos_json_invalid");
  }
  const statSearch = payload.StatisticSearch;
  if (!isRecord(statSearch)) {
    throw new ConnectorError("PARSE", "ecos_json_missing_root");
  }
  const result = statSearch.RESULT;
  if (isRecord(result)) {
    const code = asString(result.CODE).toUpperCase();
    if (code && !code.startsWith("INFO")) {
      throw new ConnectorError("FETCH", `ecos_upstream_${code}`);
    }
  }

  const rows = statSearch.row;
  if (!Array.isArray(rows)) return [];

  const byDate = new Map<string, Observation>();
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const date = normalizeEcosDate(asString(row.TIME), cycle);
    const value = parseNumericToken(row.DATA_VALUE);
    if (!date || !Number.isFinite(value)) continue;
    byDate.set(date, ObservationSchema.parse({ date, value }));
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function parseEcosBody(input: { body: string; contentType: string; cycle: string }): Observation[] {
  const text = input.body.trim();
  if (!text) return [];

  const lowerContentType = input.contentType.toLowerCase();
  const looksJson = lowerContentType.includes("json") || text.startsWith("{");
  const looksCsv = lowerContentType.includes("csv") || text.startsWith("STAT_CODE,") || text.includes(",TIME,");

  if (looksJson) {
    try {
      const payload = JSON.parse(text) as unknown;
      return parseJsonObservations(payload, input.cycle);
    } catch (error) {
      if (error instanceof ConnectorError) throw error;
      throw new ConnectorError("PARSE", "ecos_json_parse_failed");
    }
  }

  if (looksCsv) {
    return parseCsvObservations(text, input.cycle);
  }

  throw new ConnectorError("PARSE", "ecos_response_format_unknown");
}

async function defaultSleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function createEcosConnector(deps: EcosConnectorDeps = {}): SeriesConnector {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const env = deps.env ?? process.env;
  const sleep = deps.sleep ?? defaultSleep;
  const limitRetries = toSafeRetries(deps.limitRetries);
  const backoffMs = toSafeBackoffMs(deps.backoffMs);

  return {
    sourceType: "ecos",
    async fetchSeries(spec: SeriesSpec, options: FetchSeriesOptions) {
      const apiKey = resolveApiKey(env);
      const parsedExternalId = parseEcosExternalId(spec.externalId);
      const url = buildEcosUrl(parsedExternalId, apiKey);
      const maxAttempts = limitRetries + 1;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let response: Response;
        try {
          response = await fetchImpl(url, {
            method: "GET",
            headers: { accept: "application/json,text/csv" },
            cache: "no-store",
          });
        } catch {
          throw new ConnectorError("FETCH", "ecos_request_failed");
        }

        if (response.status === 429) {
          if (attempt < maxAttempts) {
            await sleep(backoffMs * attempt);
            continue;
          }
          throw new ConnectorError("LIMIT", "ecos_rate_limited");
        }

        if (!response.ok) {
          throw new ConnectorError("FETCH", `ecos_http_${response.status}`);
        }

        const contentType = asString(response.headers.get("content-type"));
        let body = "";
        try {
          body = await response.text();
        } catch {
          throw new ConnectorError("PARSE", "ecos_response_read_failed");
        }

        const observations = parseEcosBody({
          body,
          contentType,
          cycle: parsedExternalId.cycle,
        });

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

      throw new ConnectorError("INTERNAL", "ecos_retry_exhausted");
    },
  };
}

export const ecosConnector = createEcosConnector();
