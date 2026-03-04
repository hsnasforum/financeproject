import { ObservationSchema } from "../contracts.ts";
import { type ConnectorFetchResult, type Observation } from "../types.ts";

const ECOS_BASE_URL = "https://ecos.bok.or.kr/api";

export type EcosExternalIdParts = {
  statCode: string;
  itemCode1: string;
  itemCode2: string;
  itemCode3: string;
  cycle: string;
  start: string;
  end: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveApiKey(): string {
  return asString(process.env.BOK_ECOS_API_KEY) || asString(process.env.ECOS_API_KEY);
}

export function parseEcosExternalId(externalId: string): EcosExternalIdParts {
  const tokens = externalId.split("|").map((row) => row.trim());
  if (tokens.length !== 7) {
    throw new Error("INVALID_EXTERNAL_ID:ecos externalId must have 7 pipe-delimited fields");
  }
  const [statCode, itemCode1, itemCode2, itemCode3, cycle, start, end] = tokens;
  if (!statCode || !cycle || !start || !end) {
    throw new Error("INVALID_EXTERNAL_ID:missing required fields");
  }
  return {
    statCode,
    itemCode1,
    itemCode2,
    itemCode3,
    cycle,
    start,
    end,
  };
}

function buildEcosUrl(parts: EcosExternalIdParts, apiKey: string): string {
  const item1 = parts.itemCode1 || "?";
  const item2 = parts.itemCode2 || "?";
  const item3 = parts.itemCode3 || "?";
  return `${ECOS_BASE_URL}/StatisticSearch/${encodeURIComponent(apiKey)}/json/kr/1/10000/${encodeURIComponent(parts.statCode)}/${encodeURIComponent(parts.cycle)}/${encodeURIComponent(parts.start)}/${encodeURIComponent(parts.end)}/${encodeURIComponent(item1)}/${encodeURIComponent(item2)}/${encodeURIComponent(item3)}`;
}

function normalizeEcosDate(timeToken: string, cycle: string): string | null {
  const token = timeToken.trim();
  const normalizedCycle = cycle.trim().toUpperCase();
  if (normalizedCycle === "D" && /^\d{8}$/.test(token)) {
    return `${token.slice(0, 4)}-${token.slice(4, 6)}-${token.slice(6, 8)}`;
  }
  if (normalizedCycle === "M" && /^\d{6}$/.test(token)) {
    return `${token.slice(0, 4)}-${token.slice(4, 6)}-01`;
  }
  if (normalizedCycle === "Q") {
    const qMatch = token.match(/^(\d{4})Q([1-4])$/) ?? token.match(/^(\d{4})([1-4])$/);
    if (qMatch) {
      const month = String((Number(qMatch[2]) - 1) * 3 + 1).padStart(2, "0");
      return `${qMatch[1]}-${month}-01`;
    }
  }
  if ((normalizedCycle === "A" || normalizedCycle === "Y") && /^\d{4}$/.test(token)) {
    return `${token}-01-01`;
  }
  return null;
}

function parseRows(payload: unknown, cycle: string): Observation[] {
  if (!isRecord(payload)) return [];
  const root = payload.StatisticSearch;
  if (!isRecord(root)) return [];

  const result = root.RESULT;
  if (isRecord(result)) {
    const code = asString(result.CODE).toUpperCase();
    const message = asString(result.MESSAGE);
    if (code && !code.startsWith("INFO")) {
      throw new Error(`UPSTREAM_ERROR:${message || code}`);
    }
  }

  if (!Array.isArray(root.row)) return [];
  const out: Observation[] = [];
  for (const rawRow of root.row) {
    if (!isRecord(rawRow)) continue;
    const date = normalizeEcosDate(asString(rawRow.TIME), cycle);
    const value = Number(rawRow.DATA_VALUE);
    if (!date || !Number.isFinite(value)) continue;
    out.push(ObservationSchema.parse({ date, value }));
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchEcosSeries(input: {
  externalId: string;
  fetchImpl?: typeof fetch;
  apiKey?: string;
}): Promise<ConnectorFetchResult> {
  const apiKey = asString(input.apiKey) || resolveApiKey();
  if (!apiKey) {
    throw new Error("KEY_MISSING:ECOS API key is missing");
  }

  const parts = parseEcosExternalId(input.externalId);
  const fetchFn = input.fetchImpl ?? fetch;
  const response = await fetchFn(buildEcosUrl(parts, apiKey), {
    method: "GET",
    headers: {
      accept: "application/json",
      "user-agent": "finance-indicators-ecos/1.0",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`HTTP_${response.status}:ECOS request failed`);
  }

  const payload = await response.json() as unknown;
  const observations = parseRows(payload, parts.cycle);
  const asOfDate = observations[observations.length - 1]?.date ?? new Date().toISOString().slice(0, 10);

  return {
    asOf: new Date(`${asOfDate}T00:00:00.000Z`).toISOString(),
    observations,
    meta: {
      connector: "ecos",
      statCode: parts.statCode,
      cycle: parts.cycle,
    },
  };
}
