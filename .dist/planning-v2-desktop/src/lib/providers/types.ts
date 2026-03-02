import { type FallbackMeta } from "../http/fallbackMeta";
import { type fetchExternal } from "../http/fetchExternal";

export type ProviderIssue = {
  path?: string;
  message: string;
};

export type ProviderDebugTimings = Record<string, { elapsedMs: number }>;

export type ProviderMeta = {
  sourceId: string;
  generatedAt: string;
  fallback?: FallbackMeta;
  cacheKey?: string;
  fromCache?: boolean;
  fromReplay?: boolean;
  debug?: {
    timings?: ProviderDebugTimings;
    [key: string]: unknown;
  };
};

export type ProviderErrorShape = {
  code: string;
  message: string;
  issues?: string[];
  debug?: Record<string, unknown>;
};

export type ProviderResponse<TData> =
  | { ok: true; meta: ProviderMeta; data: TData }
  | { ok: false; error: ProviderErrorShape; meta?: ProviderMeta };

export type ProviderFetchContext = {
  sourceId: string;
  cacheKey: string;
  debug: boolean;
  requestId: string;
  fetchExternal: typeof fetchExternal;
};

export interface Provider<TReq = unknown, TData = unknown, TRaw = unknown> {
  id: string;
  displayName: string;
  isConfigured(env: NodeJS.ProcessEnv): boolean;
  buildCacheKey(req: TReq): string;
  fetch(req: TReq, ctx: ProviderFetchContext): Promise<ProviderResponse<TData> | TRaw>;
  normalize?: (raw: TRaw, ctx: ProviderFetchContext) => Promise<ProviderResponse<TData>> | ProviderResponse<TData>;
  cooldownKey?: string;
  replayEnabled?: () => boolean;
  lastSnapshotGeneratedAt?: () => string | null;
}
