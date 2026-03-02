type CooldownEntry = {
  nextRetryAtMs: number;
};

type CooldownStore = Map<string, CooldownEntry>;

const GLOBAL_KEY = "__finance_rate_limit_cooldown_v1__";
const DEFAULT_COOLDOWN_SECONDS = 120;
const MAX_COOLDOWN_SECONDS = 3600;

function clampCooldownSeconds(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_COOLDOWN_SECONDS;
  const safe = Math.trunc(value as number);
  return Math.max(1, Math.min(MAX_COOLDOWN_SECONDS, safe));
}

function getStore(): CooldownStore {
  const root = globalThis as typeof globalThis & { [GLOBAL_KEY]?: CooldownStore };
  if (!root[GLOBAL_KEY]) {
    root[GLOBAL_KEY] = new Map<string, CooldownEntry>();
  }
  return root[GLOBAL_KEY];
}

export function setCooldown(sourceKey: string, retryAfterSeconds?: number): { sourceKey: string; nextRetryAt: string } {
  const ttlSeconds = clampCooldownSeconds(retryAfterSeconds);
  const nextRetryAtMs = Date.now() + ttlSeconds * 1000;
  getStore().set(sourceKey, { nextRetryAtMs });
  return {
    sourceKey,
    nextRetryAt: new Date(nextRetryAtMs).toISOString(),
  };
}

export function shouldCooldown(sourceKey: string): { cooldown: boolean; nextRetryAt?: string } {
  const entry = getStore().get(sourceKey);
  if (!entry) return { cooldown: false };
  if (entry.nextRetryAtMs <= Date.now()) {
    getStore().delete(sourceKey);
    return { cooldown: false };
  }
  return {
    cooldown: true,
    nextRetryAt: new Date(entry.nextRetryAtMs).toISOString(),
  };
}

export const __test__ = {
  clear(): void {
    getStore().clear();
  },
};
