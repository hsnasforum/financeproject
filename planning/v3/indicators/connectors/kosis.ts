import type { Observation, SeriesSpec } from "../contracts";
import { ObservationSchema } from "../contracts";
import { ConnectorError } from "./errors";
import type { FetchSeriesOptions, SeriesConnector } from "./types";

const KOSIS_BASE_URL = "https://kosis.kr/openapi/statisticsData.do";
const DEFAULT_LIMIT_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 200;

export type KosisExternalIdParts = {
  orgId: string;
  tblId: string;
  itmId: string;
  objL1?: string;
  objL2?: string;
  objL3?: string;
  prdSe: "D" | "M" | "Q" | "Y" | "A";
  startPrdDe?: string;
  endPrdDe?: string;
};

type KosisConnectorDeps = {
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

function resolveApiKey(env: NodeJS.ProcessEnv): string {
  const apiKey = asString(env.KOSIS_API_KEY);
  if (!apiKey) {
    throw new ConnectorError("INPUT", "kosis_api_key_missing");
  }
  return apiKey;
}

function parseExternalIdParams(externalId: string): URLSearchParams {
  const normalized = externalId.trim().replace(/^\?/, "");
  if (!normalized) return new URLSearchParams();

  const useRaw = normalized.includes("=") && !normalized.includes("&") && !normalized.includes(";");
  const pairs = useRaw ? [normalized] : normalized.split(/[;&]/).map((row) => row.trim()).filter(Boolean);
  return new URLSearchParams(pairs.join("&"));
}

export function parseKosisExternalId(externalId: string): KosisExternalIdParts {
  const params = parseExternalIdParams(externalId);
  const prdSe = asString(params.get("prdSe")).toUpperCase();
  if (!["D", "M", "Q", "Y", "A"].includes(prdSe)) {
    throw new ConnectorError("INPUT", "kosis_prd_se_invalid");
  }

  const orgId = asString(params.get("orgId"));
  const tblId = asString(params.get("tblId"));
  const itmId = asString(params.get("itmId"));
  if (!orgId || !tblId || !itmId) {
    throw new ConnectorError("INPUT", "kosis_external_id_required_fields_missing");
  }

  const out: KosisExternalIdParts = {
    orgId,
    tblId,
    itmId,
    prdSe: prdSe as KosisExternalIdParts["prdSe"],
  };

  const objL1 = asString(params.get("objL1"));
  const objL2 = asString(params.get("objL2"));
  const objL3 = asString(params.get("objL3"));
  const startPrdDe = asString(params.get("startPrdDe"));
  const endPrdDe = asString(params.get("endPrdDe"));
  if (objL1) out.objL1 = objL1;
  if (objL2) out.objL2 = objL2;
  if (objL3) out.objL3 = objL3;
  if (startPrdDe) out.startPrdDe = startPrdDe;
  if (endPrdDe) out.endPrdDe = endPrdDe;

  return out;
}

function normalizeKosisDateToken(prdDe: string, prdSe: KosisExternalIdParts["prdSe"]): string | null {
  const token = prdDe.trim();
  if (!token) return null;

  if (prdSe === "D") {
    const compact = token.replace(/[^0-9]/g, "");
    if (/^\d{8}$/.test(compact)) {
      return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
    }
  }

  if (prdSe === "M") {
    const compact = token.replace(/[^0-9]/g, "");
    if (/^\d{6}$/.test(compact)) {
      return `${compact.slice(0, 4)}-${compact.slice(4, 6)}`;
    }
  }

  if (prdSe === "Q") {
    const matched = token.match(/^(\d{4})Q([1-4])$/i) ?? token.match(/^(\d{4})([1-4])$/);
    if (matched) {
      return `${matched[1]}-Q${matched[2]}`;
    }
  }

  if ((prdSe === "Y" || prdSe === "A") && /^\d{4}$/.test(token)) {
    return token;
  }

  return null;
}

function parseNumericToken(value: unknown): number {
  if (typeof value === "number") return value;
  const token = asString(value);
  if (!token || token === "." || token === "-") return Number.NaN;
  return Number(token.replaceAll(",", ""));
}

function parseRows(payload: unknown, prdSe: KosisExternalIdParts["prdSe"]): Observation[] {
  if (isRecord(payload)) {
    const errCd = asString(payload.errCd).toUpperCase();
    if (errCd && errCd !== "0") {
      throw new ConnectorError("FETCH", `kosis_upstream_${errCd}`);
    }
  }

  const rows = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.data)
      ? payload.data
      : [];

  const byDate = new Map<string, Observation>();
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const date = normalizeKosisDateToken(asString(row.PRD_DE ?? row.TIME), prdSe);
    const value = parseNumericToken(row.DT ?? row.DT_VAL_CO ?? row.DATA_VALUE ?? row.value);
    if (!date || !Number.isFinite(value)) continue;
    byDate.set(date, ObservationSchema.parse({ date, value }));
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function buildKosisUrl(parts: KosisExternalIdParts, apiKey: string): string {
  const url = new URL(KOSIS_BASE_URL);
  url.searchParams.set("method", "getList");
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("jsonVD", "Y");
  url.searchParams.set("orgId", parts.orgId);
  url.searchParams.set("tblId", parts.tblId);
  url.searchParams.set("itmId", parts.itmId);
  url.searchParams.set("prdSe", parts.prdSe);
  if (parts.objL1) url.searchParams.set("objL1", parts.objL1);
  if (parts.objL2) url.searchParams.set("objL2", parts.objL2);
  if (parts.objL3) url.searchParams.set("objL3", parts.objL3);
  if (parts.startPrdDe) url.searchParams.set("startPrdDe", parts.startPrdDe);
  if (parts.endPrdDe) url.searchParams.set("endPrdDe", parts.endPrdDe);
  return url.toString();
}

async function defaultSleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function createKosisConnector(deps: KosisConnectorDeps = {}): SeriesConnector {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const env = deps.env ?? process.env;
  const sleep = deps.sleep ?? defaultSleep;
  const limitRetries = toSafeRetries(deps.limitRetries);
  const backoffMs = toSafeBackoffMs(deps.backoffMs);

  return {
    sourceType: "kosis",
    async fetchSeries(spec: SeriesSpec, _options: FetchSeriesOptions) {
      void _options;
      const apiKey = resolveApiKey(env);
      const parts = parseKosisExternalId(spec.externalId);
      const url = buildKosisUrl(parts, apiKey);
      const maxAttempts = limitRetries + 1;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let response: Response;
        try {
          response = await fetchImpl(url, {
            method: "GET",
            headers: { accept: "application/json" },
            cache: "no-store",
          });
        } catch {
          throw new ConnectorError("FETCH", "kosis_request_failed");
        }

        if (response.status === 429) {
          if (attempt < maxAttempts) {
            await sleep(backoffMs * attempt);
            continue;
          }
          throw new ConnectorError("LIMIT", "kosis_rate_limited");
        }

        if (!response.ok) {
          throw new ConnectorError("FETCH", `kosis_http_${response.status}`);
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          throw new ConnectorError("PARSE", "kosis_json_parse_failed");
        }

        const observations = parseRows(payload, parts.prdSe);
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

      throw new ConnectorError("INTERNAL", "kosis_retry_exhausted");
    },
  };
}

export const kosisConnector = createKosisConnector();
