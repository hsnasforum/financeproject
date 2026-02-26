import { ExternalApiError, fetchExternal } from "../../http/fetchExternal";
import { type ExternalSourceId } from "../types";

type DatagoResponse = {
  status: number;
  text: string;
};

function appendQuery(baseUrl: string, query: string): string {
  if (!query) return baseUrl;
  return `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}${query}`;
}

export function resolveServiceKey(raw: string, missingMessage: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new ExternalApiError({
      code: "CONFIG",
      message: missingMessage,
    });
  }
  return trimmed.includes("%") ? trimmed : encodeURIComponent(trimmed);
}

export function getServiceKeyForSource(sourceId: ExternalSourceId): string {
  void sourceId;
  return resolveServiceKey(
    process.env.KDB_DATAGO_SERVICE_KEY ?? process.env.DATAGO_SERVICE_KEY ?? "",
    "Missing KDB_DATAGO_SERVICE_KEY (or DATAGO_SERVICE_KEY)",
  );
}

export function buildDatagoUrl(sourceId: ExternalSourceId, baseUrl: string, params: Record<string, string | number | undefined>): string {
  const serviceKey = getServiceKeyForSource(sourceId);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    query.set(key, String(value));
  }
  const queryString = query.toString();
  const withServiceKey = appendQuery(baseUrl, `ServiceKey=${serviceKey}`);
  return appendQuery(withServiceKey, queryString);
}

async function requestWithRetry(url: string, sourceId: ExternalSourceId): Promise<DatagoResponse> {
  const result = await fetchExternal(url, {
    timeoutMs: 12_000,
    retries: 2,
    sourceKey: `datago:${sourceId}`,
    retryOn: [429, 500, 502, 503, 504],
  });
  return {
    status: result.status,
    text: result.text,
  };
}

export async function requestDatagoText(
  sourceId: ExternalSourceId,
  baseUrl: string,
  params: Record<string, string | number | undefined>,
): Promise<DatagoResponse> {
  const url = buildDatagoUrl(sourceId, baseUrl, params);
  return requestWithRetry(url, sourceId);
}

export async function requestDatagoJson(
  sourceId: ExternalSourceId,
  baseUrl: string,
  params: Record<string, string | number | undefined>,
): Promise<unknown> {
  const { text } = await requestDatagoText(sourceId, baseUrl, params);
  try {
    return JSON.parse(text);
  } catch {
    throw new ExternalApiError({
      code: "UPSTREAM",
      message: "data.go.kr JSON 파싱에 실패했습니다.",
    });
  }
}
