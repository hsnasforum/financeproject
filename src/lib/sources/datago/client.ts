import { ExternalApiError } from "../../http/fetchExternal";
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

function maskUrl(input: string): string {
  try {
    const url = new URL(input);
    if (url.searchParams.has("ServiceKey")) {
      url.searchParams.set("ServiceKey", "****");
    }
    return url.toString();
  } catch {
    return "(invalid-url)";
  }
}

async function requestWithRetry(url: string): Promise<DatagoResponse> {
  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      const text = await res.text();
      if (!res.ok) {
        if ((res.status === 429 || res.status >= 500) && attempt < 2) {
          const waitMs = 500 * 2 ** attempt;
          attempt += 1;
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }
        throw new ExternalApiError({
          code: "UPSTREAM",
          message: `data.go.kr 호출 실패(${res.status})`,
        });
      }
      return { status: res.status, text };
    } catch (error) {
      if (error instanceof ExternalApiError) throw error;
      if (attempt < 2) {
        const waitMs = 500 * 2 ** attempt;
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      console.error("[datago] request failed", {
        url: maskUrl(url),
        message: error instanceof Error ? error.message : "unknown",
      });
      throw new ExternalApiError({
        code: "UPSTREAM",
        message: "data.go.kr 호출에 실패했습니다.",
      });
    }
  }
}

export async function requestDatagoText(
  sourceId: ExternalSourceId,
  baseUrl: string,
  params: Record<string, string | number | undefined>,
): Promise<DatagoResponse> {
  const url = buildDatagoUrl(sourceId, baseUrl, params);
  return requestWithRetry(url);
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
