export type FallbackMode = "LIVE" | "CACHE" | "REPLAY";

export type FallbackMeta = {
  mode: FallbackMode;
  sourceKey: string;
  reason?: string;
  generatedAt?: string;
  nextRetryAt?: string;
};

export function attachFallback<T extends Record<string, unknown>>(
  meta: T | null | undefined,
  fallback: FallbackMeta,
): T & { fallback: FallbackMeta } {
  const safeMeta = (meta ?? {}) as T;
  return {
    ...safeMeta,
    fallback,
  };
}
