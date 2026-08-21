import { type DartApiError } from "@/lib/publicApis/dart/types";
import { resolveDartBaseUrl } from "@/lib/publicApis/dart/baseUrl";
import { ExternalApiError, fetchExternal } from "@/lib/http/fetchExternal";

export class DartError extends Error {
  readonly info: DartApiError;

  constructor(info: DartApiError) {
    super(info.message);
    this.info = info;
  }
}

export function getDartApiKey(): string {
  const key = (process.env.OPENDART_API_KEY ?? "").trim();
  if (!key) {
    throw new DartError({
      code: "CONFIG",
      message: "OpenDART 설정이 필요합니다. OPENDART_API_KEY를 확인하세요.",
    });
  }
  return key;
}

function getDartBaseUrl(): string {
  return `${resolveDartBaseUrl()}/api`;
}

export type DartFetchJsonResult = {
  body: unknown;
  upstreamStatus: number;
  retryAfterSeconds?: number;
};

export async function fetchDartJson(
  path: string,
  params: Record<string, string>,
  timeoutMs = 10_000,
  signal?: AbortSignal | null,
): Promise<unknown> {
  return (await fetchDartJsonDetailed(path, params, timeoutMs, signal)).body;
}

export async function fetchDartJsonDetailed(
  path: string,
  params: Record<string, string>,
  timeoutMs = 10_000,
  signal?: AbortSignal | null,
): Promise<DartFetchJsonResult> {
  const apiKey = getDartApiKey();

  const query = new URLSearchParams({
    crtfc_key: apiKey,
    ...params,
  });
  const url = `${getDartBaseUrl()}/${path}?${query.toString()}`;

  try {
    const fetched = await fetchExternal(url, {
      method: "GET",
      cache: "no-store",
      retries: 0,
      signal,
      sourceKey: "opendart",
      timeoutMs,
    });
    if (fetched.kind !== "json") {
      throw new DartError({
        code: "UPSTREAM",
        message: `OpenDART 응답 형식이 올바르지 않습니다. status=${fetched.status}`,
        upstreamStatus: fetched.status,
        retryAfterSeconds: fetched.retryAfterSeconds,
      });
    }

    return {
      body: fetched.body,
      upstreamStatus: fetched.status,
      retryAfterSeconds: fetched.retryAfterSeconds,
    };
  } catch (error) {
    if (error instanceof DartError) throw error;

    if (error instanceof ExternalApiError) {
      throw new DartError({
        code: error.status === 429 ? "RATE_LIMIT" : "UPSTREAM",
        message: error.status === 429
          ? "OpenDART 요청 제한"
          : "OpenDART 호출에 실패했습니다. 잠시 후 다시 시도하세요.",
        upstreamStatus: error.status,
        retryAfterSeconds: error.retryAfterSeconds,
        timeout: error.timeout,
        aborted: error.aborted,
      });
    }

    const reason = error instanceof Error ? error.message : "unknown";
    console.error("[dart] fetch failed", {
      path,
      reason,
      hasApiKey: Boolean(process.env.OPENDART_API_KEY),
    });

    throw new DartError({
      code: "UPSTREAM",
      message: "OpenDART 호출에 실패했습니다. 잠시 후 다시 시도하세요.",
    });
  }
}
