import { ObservationSchema } from "../contracts";
import { type ConnectorFetchResult, type Observation } from "../types";

const KOSIS_BASE_URL = "https://kosis.kr/openapi/statisticsData.do";

type KosisExternalIdParts = {
  orgId: string;
  tblId: string;
  itmId: string;
  objL1?: string;
  objL2?: string;
  objL3?: string;
  prdSe: string;
  startPrdDe?: string;
  endPrdDe?: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveApiKey(): string {
  return asString(process.env.KOSIS_API_KEY);
}

function parseDslParams(externalId: string): URLSearchParams {
  const trimmed = externalId.trim().replace(/^\?/, "");
  if (!trimmed) return new URLSearchParams();
  const pairs = trimmed.includes("=")
    ? trimmed.split(/[,&]/).map((row) => row.trim()).filter(Boolean)
    : [];
  return new URLSearchParams(pairs.join("&"));
}

export function parseKosisExternalId(externalId: string): KosisExternalIdParts {
  const params = parseDslParams(externalId);

  const parts: KosisExternalIdParts = {
    orgId: asString(params.get("orgId")),
    tblId: asString(params.get("tblId")),
    itmId: asString(params.get("itmId")),
    objL1: asString(params.get("objL1")) || undefined,
    objL2: asString(params.get("objL2")) || undefined,
    objL3: asString(params.get("objL3")) || undefined,
    prdSe: asString(params.get("prdSe")).toUpperCase(),
    startPrdDe: asString(params.get("startPrdDe")) || undefined,
    endPrdDe: asString(params.get("endPrdDe")) || undefined,
  };

  if (!parts.orgId || !parts.tblId || !parts.itmId || !parts.prdSe) {
    throw new Error("INVALID_EXTERNAL_ID:orgId,tblId,itmId,prdSe are required");
  }
  if (!["D", "M", "Q", "Y", "A"].includes(parts.prdSe)) {
    throw new Error("INVALID_EXTERNAL_ID:prdSe must be one of D|M|Q|Y|A");
  }
  return parts;
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

export function normalizeKosisDate(prdDe: string, prdSe: string): string | null {
  const token = prdDe.trim();
  const normalizedPrdSe = prdSe.trim().toUpperCase();
  if (normalizedPrdSe === "D") {
    const compact = token.replace(/[^0-9]/g, "");
    if (/^\d{8}$/.test(compact)) {
      return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
    }
  }
  if (normalizedPrdSe === "M") {
    const compact = token.replace(/[^0-9]/g, "");
    if (/^\d{6}$/.test(compact)) {
      return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-01`;
    }
  }
  if (normalizedPrdSe === "Q") {
    const qMatch = token.match(/^(\d{4})Q([1-4])$/i) ?? token.match(/^(\d{4})([1-4])$/);
    if (qMatch) {
      const month = String((Number(qMatch[2]) - 1) * 3 + 1).padStart(2, "0");
      return `${qMatch[1]}-${month}-01`;
    }
  }
  if ((normalizedPrdSe === "Y" || normalizedPrdSe === "A") && /^\d{4}$/.test(token)) {
    return `${token}-01-01`;
  }
  return null;
}

function parseNumericValue(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return Number.NaN;
  const cleaned = value.replace(/,/g, "").trim();
  return Number(cleaned);
}

function parseRows(payload: unknown, prdSe: string): Observation[] {
  if (isRecord(payload)) {
    const errCode = asString(payload.errCd).toUpperCase();
    if (errCode && errCode !== "0") {
      throw new Error(`UPSTREAM_ERROR:${asString(payload.errMsg) || errCode}`);
    }
  }

  const rows = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.data)
      ? payload.data
      : [];

  const byDate = new Map<string, Observation>();
  for (const rawRow of rows) {
    if (!isRecord(rawRow)) continue;
    const date = normalizeKosisDate(asString(rawRow.PRD_DE ?? rawRow.TIME), prdSe);
    const value = parseNumericValue(rawRow.DT ?? rawRow.DT_VAL_CO ?? rawRow.DATA_VALUE ?? rawRow.value);
    if (!date || !Number.isFinite(value)) continue;
    byDate.set(date, ObservationSchema.parse({ date, value }));
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchKosisSeries(input: {
  externalId: string;
  fetchImpl?: typeof fetch;
  apiKey?: string;
}): Promise<ConnectorFetchResult> {
  const apiKey = asString(input.apiKey) || resolveApiKey();
  if (!apiKey) {
    throw new Error("KEY_MISSING:KOSIS API key is missing");
  }

  const parts = parseKosisExternalId(input.externalId);
  const fetchFn = input.fetchImpl ?? fetch;
  const response = await fetchFn(buildKosisUrl(parts, apiKey), {
    method: "GET",
    headers: {
      accept: "application/json",
      "user-agent": "finance-indicators-kosis/1.0",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`HTTP_${response.status}:KOSIS request failed`);
  }

  const payload = await response.json() as unknown;
  const observations = parseRows(payload, parts.prdSe);
  const asOfDate = observations[observations.length - 1]?.date ?? new Date().toISOString().slice(0, 10);

  return {
    asOf: new Date(`${asOfDate}T00:00:00.000Z`).toISOString(),
    observations,
    meta: {
      connector: "kosis",
      orgId: parts.orgId,
      tblId: parts.tblId,
      prdSe: parts.prdSe,
    },
  };
}
