import { type PublicApiError } from "@/lib/publicApis/contracts/types";

type FetchRetryContext = {
  status?: number;
  error?: unknown;
  attempt: number;
  maxAttempts: number;
  retryAfterSeconds?: number;
};

export type FetchExternalOptions = Omit<RequestInit, "signal"> & {
  timeoutMs?: number;
  retries?: number;
  sourceKey?: string;
  retryOn?: number[] | ((context: FetchRetryContext) => boolean);
  throwOnHttpError?: boolean;
  signal?: AbortSignal | null;
};

export type FetchExternalResult = {
  ok: boolean;
  status: number;
  kind: "json" | "xml" | "text";
  body: unknown;
  text: string;
  contentType: string;
  headers: Headers;
  retryAfterSeconds?: number;
  attempts: number;
};

export class ExternalApiError extends Error {
  readonly detail: PublicApiError;

  readonly status?: number;

  readonly retryAfterSeconds?: number;

  readonly timeout?: boolean;

  constructor(
    detail: PublicApiError,
    options?: {
      status?: number;
      retryAfterSeconds?: number;
      timeout?: boolean;
    },
  ) {
    super(detail.message);
    this.detail = detail;
    this.status = options?.status;
    this.retryAfterSeconds = options?.retryAfterSeconds;
    this.timeout = options?.timeout;
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

function parseRetryAfterSeconds(headerValue: string | null): number | undefined {
  if (!headerValue) return undefined;
  const asInt = Number(headerValue.trim());
  if (Number.isFinite(asInt) && asInt >= 0) return Math.trunc(asInt);
  const asDate = Date.parse(headerValue);
  if (!Number.isFinite(asDate)) return undefined;
  const seconds = Math.ceil((asDate - Date.now()) / 1000);
  return seconds > 0 ? seconds : 0;
}

function defaultShouldRetry(status: number | undefined, timeout: boolean): boolean {
  if (timeout) return true;
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function resolveShouldRetry(options: FetchExternalOptions | undefined, context: FetchRetryContext, timeout: boolean): boolean {
  const retryOn = options?.retryOn;
  if (typeof retryOn === "function") {
    return retryOn(context);
  }
  if (Array.isArray(retryOn) && retryOn.length > 0) {
    return typeof context.status === "number" && retryOn.includes(context.status);
  }
  return defaultShouldRetry(context.status, timeout);
}

function parsePositiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const clamped = Math.max(0, Math.trunc(parsed));
  return Math.min(max, clamped);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number, retryAfterSeconds?: number): number {
  if (Number.isFinite(retryAfterSeconds)) {
    const clamped = Math.max(0, Math.min(60, Math.trunc(retryAfterSeconds ?? 0)));
    return clamped * 1000;
  }
  return Math.min(10_000, 500 * 2 ** Math.max(0, attempt - 1));
}

function parseResponseBody(text: string, contentType: string): { kind: "json" | "xml" | "text"; body: unknown } {
  const trimmed = text.trim();
  if (contentType.includes("json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return { kind: "json", body: JSON.parse(text) };
    } catch {
      throw new ExternalApiError({ code: "UPSTREAM", message: "외부 API JSON 파싱에 실패했습니다." });
    }
  }

  if (contentType.includes("xml") || trimmed.startsWith("<")) {
    return { kind: "xml", body: text };
  }

  return { kind: "text", body: text };
}

type ResolvedFetchOptions = FetchExternalOptions & {
  timeoutMs: number;
  retries: number;
  throwOnHttpError: boolean;
};

function resolveOptions(input: FetchExternalOptions | number | undefined): ResolvedFetchOptions {
  if (typeof input === "number") {
    return {
      timeoutMs: Math.max(100, input),
      retries: 0,
      throwOnHttpError: true,
    };
  }
  return {
    ...(input ?? {}),
    timeoutMs: parsePositiveInt(input?.timeoutMs, 10_000, 120_000) || 10_000,
    retries: parsePositiveInt(input?.retries, 0, 5),
    throwOnHttpError: input?.throwOnHttpError !== false,
  };
}

function externalAbortReason(signal: AbortSignal | null | undefined): unknown {
  if (!signal) return undefined;
  if (typeof signal.reason !== "undefined") return signal.reason;
  return undefined;
}

export async function fetchExternal(
  url: string,
  optionsOrTimeout?: FetchExternalOptions | number,
): Promise<FetchExternalResult> {
  const options = resolveOptions(optionsOrTimeout);
  const {
    timeoutMs,
    retries,
    sourceKey,
    retryOn,
    throwOnHttpError,
    signal,
    ...requestInit
  } = options;

  void retryOn;

  const maxAttempts = retries + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const externalAbortHandler = () => {
      controller.abort(externalAbortReason(signal));
    };
    signal?.addEventListener("abort", externalAbortHandler, { once: true });

    try {
      const response = await fetch(url, {
        ...requestInit,
        signal: controller.signal,
        cache: requestInit.cache ?? "no-store",
      });

      const text = await response.text();
      const contentType = response.headers.get("content-type") ?? "";
      const parsed = parseResponseBody(text, contentType);
      const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get("retry-after"));

      if (!response.ok && throwOnHttpError) {
        const retryable = attempt < maxAttempts && resolveShouldRetry(
          options,
          {
            status: response.status,
            attempt,
            maxAttempts,
            retryAfterSeconds,
          },
          false,
        );

        if (retryable) {
          await sleep(backoffMs(attempt, response.status === 429 ? retryAfterSeconds : undefined));
          continue;
        }

        console.error("[external] upstream status", {
          sourceKey,
          status: response.status,
          url: maskUrl(url),
        });
        throw new ExternalApiError(
          { code: "UPSTREAM", message: "외부 API 호출에 실패했습니다." },
          {
            status: response.status,
            retryAfterSeconds,
          },
        );
      }

      return {
        ok: response.ok,
        status: response.status,
        kind: parsed.kind,
        body: parsed.body,
        text,
        contentType,
        headers: response.headers,
        retryAfterSeconds,
        attempts: attempt,
      };
    } catch (error) {
      if (error instanceof ExternalApiError) throw error;

      const timeout = timedOut || (error instanceof Error && error.name === "AbortError");
      const retryable = attempt < maxAttempts && resolveShouldRetry(
        options,
        {
          error,
          attempt,
          maxAttempts,
        },
        timeout,
      );
      if (retryable) {
        await sleep(backoffMs(attempt));
        continue;
      }

      console.error("[external] fetch failed", {
        sourceKey,
        url: maskUrl(url),
        reason: error instanceof Error ? error.message : "unknown",
        timeout,
      });
      throw new ExternalApiError(
        { code: "UPSTREAM", message: "외부 API 호출에 실패했습니다." },
        { timeout },
      );
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", externalAbortHandler);
    }
  }

  throw new ExternalApiError({
    code: "UPSTREAM",
    message: "외부 API 호출에 실패했습니다.",
  });
}

function maskUrl(input: string): string {
  try {
    const url = new URL(input);
    for (const key of url.searchParams.keys()) {
      const lowered = key.toLowerCase();
      if (
        lowered.includes("key")
        || lowered.includes("service")
        || lowered.includes("auth")
        || lowered.includes("token")
      ) {
        url.searchParams.set(key, "****");
      }
    }
    return url.toString();
  } catch {
    return "(invalid-url)";
  }
}
