import { type DartApiError } from "@/lib/publicApis/dart/types";
import { resolveDartBaseUrl } from "@/lib/publicApis/dart/baseUrl";

export class DartError extends Error {
  readonly info: DartApiError;

  constructor(info: DartApiError) {
    super(info.message);
    this.info = info;
  }
}

export function getDartApiKey(): string {
  const key = process.env.OPENDART_API_KEY;
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

export async function fetchDartJson(path: string, params: Record<string, string>, timeoutMs = 10_000): Promise<unknown> {
  const apiKey = getDartApiKey();

  const query = new URLSearchParams({
    crtfc_key: apiKey,
    ...params,
  });
  const url = `${getDartBaseUrl()}/${path}?${query.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { method: "GET", signal: controller.signal, cache: "no-store" });
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json") && !contentType.includes("text/json")) {
      throw new DartError({
        code: "UPSTREAM",
        message: `OpenDART 응답 형식이 올바르지 않습니다. status=${response.status}`,
      });
    }

    const payload = await response.json();
    return payload;
  } catch (error) {
    if (error instanceof DartError) throw error;

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
  } finally {
    clearTimeout(timer);
  }
}
