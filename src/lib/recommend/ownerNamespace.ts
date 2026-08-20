declare const recommendOwnerIdBrand: unique symbol;

export type RecommendOwnerId = string & {
  readonly [recommendOwnerIdBrand]: "RecommendOwnerId";
};

export const RECOMMEND_OWNER_STORAGE_PREFIX = "finance:recommend:v2:";

export const RECOMMEND_STORAGE_SCOPES = [
  "profile",
  "last-result",
  "saved-runs",
  "autorun",
] as const;

export const RECOMMEND_LEGACY_STORAGE_KEYS = [
  "recommend_profile_v1",
  "recommend_last_result_v1",
  "recommend_saved_runs_v1",
  "recommend_autorun_sig",
] as const;

export type RecommendStorageScope = (typeof RECOMMEND_STORAGE_SCOPES)[number];

export function recommendOwnerId(value: string): RecommendOwnerId {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("recommend owner id is required");
  }
  return normalized as RecommendOwnerId;
}

export function recommendOwnerStorageKey(
  ownerId: RecommendOwnerId,
  scope: RecommendStorageScope,
): string {
  return `${RECOMMEND_OWNER_STORAGE_PREFIX}${encodeURIComponent(ownerId)}:${scope}`;
}

export function recommendOwnerStorageKeys(ownerId: RecommendOwnerId): string[] {
  return RECOMMEND_STORAGE_SCOPES.map((scope) => recommendOwnerStorageKey(ownerId, scope));
}

export function isRecommendOwnerStorageKey(value: string): boolean {
  const key = value.trim();
  if (!key.startsWith(RECOMMEND_OWNER_STORAGE_PREFIX)) return false;

  const ownerAndScope = key.slice(RECOMMEND_OWNER_STORAGE_PREFIX.length);
  const separatorIndex = ownerAndScope.lastIndexOf(":");
  if (separatorIndex <= 0) return false;

  const encodedOwner = ownerAndScope.slice(0, separatorIndex);
  const scope = ownerAndScope.slice(separatorIndex + 1);
  if (!(RECOMMEND_STORAGE_SCOPES as readonly string[]).includes(scope)) return false;

  try {
    const decodedOwner = decodeURIComponent(encodedOwner);
    return decodedOwner.trim().length > 0 && encodeURIComponent(decodedOwner) === encodedOwner;
  } catch {
    return false;
  }
}

export function isRecommendOwner(
  ownerId: RecommendOwnerId,
  candidate: unknown,
): boolean {
  return typeof candidate === "string" && candidate === ownerId;
}
