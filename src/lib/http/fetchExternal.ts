import { type PublicApiError } from "@/lib/publicApis/contracts/types";

type FetchRetryContext = {
  status?: number;
  error?: unknown;
  attempt: number;
  maxAttempts: number;
  retryAfterSeconds?: number;
};

export type FetchExternalOptions = Omit<RequestInit, "signal"> & {
  /** fetch, response body read, retry, and backoff를 모두 포함하는 전체 제한 시간 */
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

  readonly timeout: boolean;

  readonly aborted: boolean;

  constructor(
    detail: PublicApiError,
    options?: {
      status?: number;
      retryAfterSeconds?: number;
      timeout?: boolean;
      aborted?: boolean;
      cause?: unknown;
    },
  ) {
    super(detail.message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.detail = detail;
    this.status = options?.status;
    this.retryAfterSeconds = options?.retryAfterSeconds;
    this.timeout = options?.timeout === true;
    this.aborted = options?.aborted === true;
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

function backoffMs(attempt: number, retryAfterSeconds?: number): number {
  if (Number.isFinite(retryAfterSeconds)) {
    const clamped = Math.max(0, Math.min(60, Math.trunc(retryAfterSeconds ?? 0)));
    return clamped * 1000;
  }
  return Math.min(10_000, 500 * 2 ** Math.max(0, attempt - 1));
}

function monotonicNowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function deadlineExpired(deadlineAt: number): boolean {
  return monotonicNowMs() >= deadlineAt;
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

type FetchControlFailureKind = "external-abort" | "timeout";

class FetchControlFailure extends Error {
  readonly kind: FetchControlFailureKind;

  constructor(kind: FetchControlFailureKind) {
    super(kind);
    this.kind = kind;
  }
}

function toExternalFailure(
  kind: FetchControlFailureKind,
  metadata: { status?: number; retryAfterSeconds?: number } = {},
  cause?: unknown,
): ExternalApiError {
  return new ExternalApiError(
    { code: "UPSTREAM", message: "외부 API 호출에 실패했습니다." },
    {
      ...metadata,
      aborted: kind === "external-abort",
      timeout: kind === "timeout",
      cause,
    },
  );
}

async function releaseResponseBody(
  response: Response,
  control: { deadlineAt: number; signal?: AbortSignal | null },
): Promise<void> {
  const body = response.body;
  if (!body) return;
  if (control.signal?.aborted) {
    throw new FetchControlFailure("external-abort");
  }

  const remainingMs = Math.max(0, control.deadlineAt - monotonicNowMs());
  if (remainingMs <= 0) {
    throw new FetchControlFailure("timeout");
  }

  const cancellation = Promise.resolve()
    .then(() => body.cancel())
    .catch(() => undefined);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      control.signal?.removeEventListener("abort", onExternalAbort);
      callback();
    };
    const onExternalAbort = () => {
      finish(() => reject(new FetchControlFailure("external-abort")));
    };
    const timeoutId = setTimeout(() => {
      finish(() => reject(new FetchControlFailure("timeout")));
    }, remainingMs);

    cancellation.then(() => finish(resolve));
    control.signal?.addEventListener("abort", onExternalAbort, { once: true });
    if (control.signal?.aborted) onExternalAbort();
  });
}

function waitForRetry(input: {
  delayMs: number;
  deadlineAt: number;
  signal?: AbortSignal | null;
}): Promise<void> {
  const { delayMs, deadlineAt, signal } = input;
  if (signal?.aborted) {
    return Promise.reject(new FetchControlFailure("external-abort"));
  }

  const remainingMs = Math.max(0, deadlineAt - monotonicNowMs());
  if (remainingMs <= 0) {
    return Promise.reject(new FetchControlFailure("timeout"));
  }

  const hitsDeadline = delayMs >= remainingMs;
  const waitMs = Math.min(delayMs, remainingMs);

  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", onExternalAbort);
    const onExternalAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(new FetchControlFailure("external-abort"));
    };
    const timer = setTimeout(() => {
      cleanup();
      if (hitsDeadline) {
        reject(new FetchControlFailure("timeout"));
        return;
      }
      resolve();
    }, waitMs);

    signal?.addEventListener("abort", onExternalAbort, { once: true });
    if (signal?.aborted) onExternalAbort();
  });
}

async function waitForRetryOrThrow(input: {
  delayMs: number;
  deadlineAt: number;
  signal?: AbortSignal | null;
}): Promise<void> {
  try {
    await waitForRetry(input);
  } catch (error) {
    if (error instanceof FetchControlFailure) {
      throw toExternalFailure(
        error.kind,
        {},
        error.kind === "external-abort" ? externalAbortReason(input.signal) : error,
      );
    }
    throw error;
  }
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
  const deadlineAt = monotonicNowMs() + timeoutMs;

  if (signal?.aborted) {
    throw toExternalFailure("external-abort", {}, externalAbortReason(signal));
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const remainingMs = Math.max(0, deadlineAt - monotonicNowMs());
    if (remainingMs <= 0) {
      throw toExternalFailure("timeout");
    }

    const controller = new AbortController();
    let controlFailure: FetchControlFailureKind | null = null;
    let responseStatus: number | undefined;
    let responseRetryAfterSeconds: number | undefined;
    let responseWasHttpError = false;
    const observedControlFailure = (): FetchControlFailureKind | null => {
      return controlFailure ?? (deadlineExpired(deadlineAt) ? "timeout" : null);
    };
    const throwIfControlFailed = () => {
      const failure = observedControlFailure();
      if (failure) throw new FetchControlFailure(failure);
    };
    const timeoutId = setTimeout(() => {
      if (controlFailure) return;
      controlFailure = "timeout";
      controller.abort();
    }, remainingMs);

    const externalAbortHandler = () => {
      if (controlFailure) return;
      controlFailure = deadlineExpired(deadlineAt) ? "timeout" : "external-abort";
      controller.abort(externalAbortReason(signal));
    };
    signal?.addEventListener("abort", externalAbortHandler, { once: true });
    if (signal?.aborted) externalAbortHandler();

    try {
      throwIfControlFailed();
      const response = await fetch(url, {
        ...requestInit,
        signal: controller.signal,
        cache: requestInit.cache ?? "no-store",
      });
      throwIfControlFailed();

      const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get("retry-after"));
      responseStatus = response.status;
      responseRetryAfterSeconds = retryAfterSeconds;
      responseWasHttpError = !response.ok;

      if (!response.ok) {
        const retryable = throwOnHttpError && attempt < maxAttempts && resolveShouldRetry(
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
          await releaseResponseBody(response, { deadlineAt, signal });
          throwIfControlFailed();
          await waitForRetry({
            delayMs: backoffMs(attempt, response.status === 429 ? retryAfterSeconds : undefined),
            deadlineAt,
            signal,
          });
          continue;
        }

        if (throwOnHttpError) {
          await releaseResponseBody(response, { deadlineAt, signal });
          throwIfControlFailed();
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
      }

      const text = await response.text();
      throwIfControlFailed();
      const contentType = response.headers.get("content-type") ?? "";
      let parsed: ReturnType<typeof parseResponseBody>;
      try {
        parsed = parseResponseBody(text, contentType);
      } catch (error) {
        if (!response.ok && error instanceof ExternalApiError) {
          parsed = { kind: "text", body: text };
        } else if (error instanceof ExternalApiError) {
          throw new ExternalApiError(error.detail, {
            status: response.status,
            retryAfterSeconds,
          });
        } else {
          throw error;
        }
      }
      throwIfControlFailed();

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
      const failureKind = observedControlFailure()
        ?? (error instanceof FetchControlFailure ? error.kind : null);
      if (failureKind === "external-abort") {
        throw toExternalFailure("external-abort", {
          status: responseStatus,
          retryAfterSeconds: responseRetryAfterSeconds,
        }, externalAbortReason(signal));
      }

      const timeout = failureKind === "timeout"
        || (error instanceof Error && error.name === "AbortError");
      if (timeout) {
        console.error("[external] fetch failed", {
          sourceKey,
          url: maskUrl(url),
          reason: error instanceof Error ? error.message : "unknown",
          timeout: true,
        });
        throw toExternalFailure("timeout", {
          status: responseStatus,
          retryAfterSeconds: responseRetryAfterSeconds,
        }, error);
      }

      if (error instanceof ExternalApiError) throw error;

      if (responseWasHttpError && !throwOnHttpError) {
        throw new ExternalApiError(
          { code: "UPSTREAM", message: "외부 API 응답 본문을 읽지 못했습니다." },
          {
            status: responseStatus,
            retryAfterSeconds: responseRetryAfterSeconds,
            cause: error,
          },
        );
      }

      const retryable = attempt < maxAttempts && resolveShouldRetry(
        options,
        {
          error,
          attempt,
          maxAttempts,
        },
        false,
      );
      if (retryable) {
        await waitForRetryOrThrow({ delayMs: backoffMs(attempt), deadlineAt, signal });
        continue;
      }

      console.error("[external] fetch failed", {
        sourceKey,
        url: maskUrl(url),
        reason: error instanceof Error ? error.message : "unknown",
        timeout: false,
      });
      throw new ExternalApiError(
        { code: "UPSTREAM", message: "외부 API 호출에 실패했습니다." },
        {
          aborted: false,
          status: responseStatus,
          retryAfterSeconds: responseRetryAfterSeconds,
        },
      );
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", externalAbortHandler);
    }
  }

  throw new ExternalApiError({
    code: "UPSTREAM",
    message: "외부 API 호출에 실패했습니다.",
  }, { timeout: deadlineExpired(deadlineAt) });
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
