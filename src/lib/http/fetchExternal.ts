import { type PublicApiError } from "@/lib/publicApis/contracts/types";

export class ExternalApiError extends Error {
  readonly detail: PublicApiError;

  constructor(detail: PublicApiError) {
    super(detail.message);
    this.detail = detail;
  }
}

export function requireServerEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new ExternalApiError({
      code: "CONFIG",
      message: `${name} 설정이 필요합니다.`,
    });
  }
  return value;
}

export async function fetchExternal(url: string, timeoutMs = 10_000): Promise<{ kind: "json" | "xml" | "text"; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    const text = await res.text();
    if (!res.ok) {
      console.error("[external] upstream status", { status: res.status, url: maskUrl(url) });
      throw new ExternalApiError({ code: "UPSTREAM", message: "외부 API 호출에 실패했습니다." });
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("json") || text.trim().startsWith("{") || text.trim().startsWith("[")) {
      try {
        return { kind: "json", body: JSON.parse(text) };
      } catch {
        throw new ExternalApiError({ code: "UPSTREAM", message: "외부 API JSON 파싱에 실패했습니다." });
      }
    }

    if (contentType.includes("xml") || text.trim().startsWith("<")) {
      return { kind: "xml", body: text };
    }

    return { kind: "text", body: text };
  } catch (error) {
    if (error instanceof ExternalApiError) throw error;
    console.error("[external] fetch failed", { url: maskUrl(url), reason: error instanceof Error ? error.message : "unknown" });
    throw new ExternalApiError({ code: "UPSTREAM", message: "외부 API 호출에 실패했습니다." });
  } finally {
    clearTimeout(timer);
  }
}

function maskUrl(input: string): string {
  try {
    const url = new URL(input);
    for (const key of url.searchParams.keys()) {
      if (key.toLowerCase().includes("key") || key.toLowerCase().includes("service") || key.toLowerCase().includes("auth")) {
        url.searchParams.set(key, "****");
      }
    }
    return url.toString();
  } catch {
    return "(invalid-url)";
  }
}
