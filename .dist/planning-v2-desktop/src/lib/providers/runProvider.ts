import crypto from "node:crypto";
import { singleflight } from "../cache/singleflight";
import { attachFallback, type FallbackMeta } from "../http/fallbackMeta";
import { fetchExternal } from "../http/fetchExternal";
import { setCooldown, shouldCooldown } from "../http/rateLimitCooldown";
import { timingsToDebugMap, type TimingEntry, withTiming } from "../http/timing";
import { ExternalApiError } from "../http/fetchExternal";
import { type Provider, type ProviderErrorShape, type ProviderMeta, type ProviderResponse } from "./types";

const DEFAULT_COOLDOWN_SECONDS = 120;

const UPSTREAM_ERROR_CODES = new Set([
  "UPSTREAM",
  "UPSTREAM_ERROR",
  "FETCH_FAILED",
  "HTTP",
  "INTERNAL",
]);

function toIsoOrNow(value: string | undefined): string {
  const parsed = Date.parse(value ?? "");
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  return new Date().toISOString();
}

function toProviderError(error: unknown): ProviderErrorShape {
  if (error instanceof ExternalApiError) {
    return {
      code: "UPSTREAM",
      message: error.detail.message,
      debug: {
        upstreamStatus: error.status,
        retryAfterSeconds: error.retryAfterSeconds,
        timeout: error.timeout,
      },
    };
  }
  const message = error instanceof Error ? error.message : "provider execution failed";
  return {
    code: "INTERNAL",
    message,
  };
}

function isProviderResponse<TData>(value: unknown): value is ProviderResponse<TData> {
  if (!value || typeof value !== "object") return false;
  if (!("ok" in value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.ok === "boolean";
}

function getRetryAfterSeconds(debug: Record<string, unknown> | undefined): number | undefined {
  if (!debug) return undefined;
  const retryAfter = debug.retryAfterSeconds;
  if (typeof retryAfter === "number" && Number.isFinite(retryAfter) && retryAfter >= 0) {
    return Math.trunc(retryAfter);
  }
  return undefined;
}

function buildMeta(input: {
  sourceId: string;
  cacheKey: string;
  debug: boolean;
  timings: TimingEntry[];
  fallback: FallbackMeta;
  meta?: ProviderMeta;
}): ProviderMeta {
  const existing = input.meta ?? {
    sourceId: input.sourceId,
    generatedAt: new Date().toISOString(),
  };

  const baseMeta: ProviderMeta = {
    ...existing,
    sourceId: input.sourceId,
    generatedAt: toIsoOrNow(existing.generatedAt),
    cacheKey: existing.cacheKey ?? input.cacheKey,
    fromCache: existing.fromCache ?? input.fallback.mode === "CACHE",
    fromReplay: existing.fromReplay ?? input.fallback.mode === "REPLAY",
  };

  const withFallback = attachFallback(baseMeta as Record<string, unknown>, input.fallback) as ProviderMeta;
  if (!input.debug) {
    return {
      ...withFallback,
      debug: undefined,
    };
  }

  return {
    ...withFallback,
    debug: {
      ...(withFallback.debug ?? {}),
      timings: timingsToDebugMap(input.timings),
    },
  };
}

function shouldSetCooldown(code: string): boolean {
  return UPSTREAM_ERROR_CODES.has(code);
}

export type RunProviderOptions<TData> = {
  debug?: boolean;
  env?: NodeJS.ProcessEnv;
  singleflight?: boolean;
  bypassCooldown?: boolean;
  cooldownSeconds?: number;
  onCooldown?: (input: { sourceId: string; cacheKey: string; nextRetryAt?: string }) => Promise<ProviderResponse<TData> | null> | ProviderResponse<TData> | null;
};

export async function runProvider<TReq, TData, TRaw = unknown>(
  provider: Provider<TReq, TData, TRaw>,
  req: TReq,
  options?: RunProviderOptions<TData>,
): Promise<ProviderResponse<TData>> {
  const env = options?.env ?? process.env;
  const debug = options?.debug === true;
  const sourceId = provider.id;
  const sourceKey = provider.cooldownKey ?? provider.id;
  const cacheKey = provider.buildCacheKey(req);
  const requestId = crypto.randomUUID();

  const execute = async (): Promise<ProviderResponse<TData>> => {
    const timings: TimingEntry[] = [];

    if (!provider.isConfigured(env)) {
      return {
        ok: false,
        error: {
          code: "ENV_MISSING",
          message: `${provider.displayName} 설정이 필요합니다.`,
        },
        meta: buildMeta({
          sourceId,
          cacheKey,
          debug,
          timings,
          fallback: {
            mode: "LIVE",
            sourceKey,
            reason: "config_missing",
          },
        }),
      };
    }

    if (!options?.bypassCooldown) {
      const cooldown = shouldCooldown(sourceKey);
      if (cooldown.cooldown) {
        const degraded = await options?.onCooldown?.({
          sourceId,
          cacheKey,
          nextRetryAt: cooldown.nextRetryAt,
        });
        if (degraded) {
          const fallbackMeta: FallbackMeta = {
            mode: "CACHE",
            sourceKey,
            reason: "cooldown_degraded",
            nextRetryAt: cooldown.nextRetryAt,
          };
          if (degraded.ok) {
            return {
              ...degraded,
              meta: buildMeta({
                sourceId,
                cacheKey,
                debug,
                timings,
                fallback: fallbackMeta,
                meta: degraded.meta,
              }),
            };
          }
          return {
            ...degraded,
            meta: buildMeta({
              sourceId,
              cacheKey,
              debug,
              timings,
              fallback: fallbackMeta,
              meta: degraded.meta,
            }),
            error: {
              ...degraded.error,
              debug: debug ? degraded.error.debug : undefined,
            },
          };
        }

        return {
          ok: false,
          error: {
            code: "UPSTREAM",
            message: "현재 호출 제한으로 잠시 후 다시 시도해주세요.",
          },
          meta: buildMeta({
            sourceId,
            cacheKey,
            debug,
            timings,
            fallback: {
              mode: "CACHE",
              sourceKey,
              reason: "cooldown_blocked",
              nextRetryAt: cooldown.nextRetryAt,
            },
          }),
        };
      }
    }

    try {
      const fetched = await withTiming(`${sourceId}.fetch`, () => provider.fetch(req, {
        sourceId,
        cacheKey,
        debug,
        requestId,
        fetchExternal,
      }));
      timings.push(fetched.timing);

      let normalized: ProviderResponse<TData>;
      if (isProviderResponse<TData>(fetched.value)) {
        normalized = fetched.value;
      } else if (provider.normalize) {
        const normalizeTimed = await withTiming(`${sourceId}.normalize`, () => provider.normalize?.(fetched.value as TRaw, {
          sourceId,
          cacheKey,
          debug,
          requestId,
          fetchExternal,
        }) as Promise<ProviderResponse<TData>>);
        timings.push(normalizeTimed.timing);
        normalized = normalizeTimed.value;
      } else {
        normalized = {
          ok: false,
          error: {
            code: "INTERNAL",
            message: `${sourceId} provider normalize()가 필요합니다.`,
          },
          meta: {
            sourceId,
            generatedAt: new Date().toISOString(),
          },
        };
      }

      if (normalized.ok) {
        const fallback = normalized.meta?.fallback ?? {
          mode: "LIVE" as const,
          sourceKey,
          reason: "provider_success",
        };
        return {
          ...normalized,
          meta: buildMeta({
            sourceId,
            cacheKey,
            debug,
            timings,
            fallback,
            meta: normalized.meta,
          }),
        };
      }

      let cooldownNextRetryAt: string | undefined;
      const retryAfterSeconds = getRetryAfterSeconds(normalized.error.debug);
      if (shouldSetCooldown(normalized.error.code)) {
        cooldownNextRetryAt = setCooldown(sourceKey, retryAfterSeconds ?? options?.cooldownSeconds ?? DEFAULT_COOLDOWN_SECONDS).nextRetryAt;
      }

      const fallback = normalized.meta?.fallback ?? {
        mode: "LIVE" as const,
        sourceKey,
        reason: "provider_error",
        nextRetryAt: cooldownNextRetryAt,
      };

      return {
        ...normalized,
        error: {
          ...normalized.error,
          debug: debug ? normalized.error.debug : undefined,
        },
        meta: buildMeta({
          sourceId,
          cacheKey,
          debug,
          timings,
          fallback,
          meta: normalized.meta,
        }),
      };
    } catch (error) {
      const parsed = toProviderError(error);
      let cooldownNextRetryAt: string | undefined;
      const retryAfterSeconds = getRetryAfterSeconds(parsed.debug);
      if (shouldSetCooldown(parsed.code)) {
        cooldownNextRetryAt = setCooldown(sourceKey, retryAfterSeconds ?? options?.cooldownSeconds ?? DEFAULT_COOLDOWN_SECONDS).nextRetryAt;
      }
      return {
        ok: false,
        error: {
          ...parsed,
          debug: debug ? parsed.debug : undefined,
        },
        meta: buildMeta({
          sourceId,
          cacheKey,
          debug,
          timings,
          fallback: {
            mode: "LIVE",
            sourceKey,
            reason: "provider_throw",
            nextRetryAt: cooldownNextRetryAt,
          },
        }),
      };
    }
  };

  if (options?.singleflight === false) {
    return execute();
  }
  return singleflight(`provider:${sourceId}:${cacheKey}`, execute);
}

export function providerErrorToApiError(error: ProviderErrorShape): {
  code: string;
  message: string;
  issues?: string[];
  debug?: Record<string, unknown>;
} {
  return {
    code: error.code,
    message: error.message,
    ...(Array.isArray(error.issues) && error.issues.length > 0 ? { issues: error.issues } : {}),
    ...(error.debug && Object.keys(error.debug).length > 0 ? { debug: error.debug } : {}),
  };
}
