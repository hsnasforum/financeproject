import {
  recommendOwnerStorageKey,
  type RecommendOwnerId,
} from "@/lib/recommend/ownerNamespace";
import {
  buildStoredRecommendProfile,
  recommendProfileStorageKey,
  recommendResultStorageKey,
  type StoredRecommendItemV1,
  type StoredRecommendResultV2,
} from "@/lib/recommend/recommendStorageAdapter";
import { buildOwnerSavedRunsFromLegacy } from "@/lib/recommend/savedRunsStore";
import {
  parseRecommendProfile,
  type RecommendProfileNormalized,
} from "@/lib/schemas/recommendProfile";

export const LEGACY_RECOMMEND_PROFILE_KEY = "recommend_profile_v1";
export const LEGACY_RECOMMEND_RESULT_KEY = "recommend_last_result_v1";
export const LEGACY_RECOMMEND_SAVED_RUNS_KEY = "recommend_saved_runs_v1";

export const MIGRATABLE_LEGACY_RECOMMEND_KEYS = [
  LEGACY_RECOMMEND_PROFILE_KEY,
  LEGACY_RECOMMEND_RESULT_KEY,
  LEGACY_RECOMMEND_SAVED_RUNS_KEY,
] as const;

export const LEGACY_RECOMMEND_RESOLVED_EVENT = "finance:recommend-legacy-resolved";

type LegacyRecommendKey = (typeof MIGRATABLE_LEGACY_RECOMMEND_KEYS)[number];
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type StorageMap = Record<string, string | null | undefined>;

type MigrationEntry = {
  legacyKey: LegacyRecommendKey;
  ownerKey: string;
  value: string;
  itemCount: number;
};

export type LegacyRecommendMigrationPlan = {
  entries: MigrationEntry[];
  ownerStorageMap: Record<string, string>;
  skippedLegacyKeys: LegacyRecommendKey[];
};

export type LegacyRecommendMigrationResult = {
  migratedLegacyKeys: LegacyRecommendKey[];
  skippedLegacyKeys: LegacyRecommendKey[];
  remainingLegacyKeys: LegacyRecommendKey[];
  migratedSavedRunCount: number;
};

export type LegacyRecommendBackupRestorePlan = {
  clientStorageMap: Record<string, string | null>;
  migratedEntryCount: number;
  skippedLegacyKeys: LegacyRecommendKey[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasTextValue(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseLegacyProfile(raw: string): RecommendProfileNormalized | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    const normalizedInput = {
      ...parsed,
      ...(parsed.candidatePool === "legacy" ? { candidatePool: "unified" } : {}),
    };
    const normalized = parseRecommendProfile(normalizedInput);
    return normalized.issues.length === 0 ? normalized.value : null;
  } catch {
    return null;
  }
}

function normalizeLegacyResultItem(value: unknown, index: number): StoredRecommendItemV1 | null {
  if (!isRecord(value)) return null;
  const sourceId = typeof value.sourceId === "string" ? value.sourceId.trim() : "";
  const finPrdtCd = typeof value.finPrdtCd === "string" ? value.finPrdtCd.trim() : "";
  if (!sourceId || !finPrdtCd) return null;
  if (typeof value.productName !== "string" || typeof value.providerName !== "string") return null;

  const appliedRate = value.appliedRate === null
    ? null
    : (typeof value.appliedRate === "number" && Number.isFinite(value.appliedRate)
      ? value.appliedRate
      : null);
  if (value.appliedRate !== null && appliedRate === null) return null;
  if (value.saveTrm !== null && value.saveTrm !== undefined && typeof value.saveTrm !== "string") return null;

  const rank = Number(value.rank);
  return {
    key: `${sourceId}::${finPrdtCd}`,
    sourceId,
    finPrdtCd,
    productName: value.productName,
    providerName: value.providerName,
    rank: Number.isInteger(rank) && rank > 0 ? rank : index + 1,
    appliedRate,
    saveTrm: typeof value.saveTrm === "string" && value.saveTrm.trim()
      ? value.saveTrm.trim()
      : null,
  };
}

function parseLegacyResult(
  ownerId: RecommendOwnerId,
  raw: string,
): StoredRecommendResultV2<RecommendProfileNormalized, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.version !== 1) return null;
    if (typeof parsed.savedAt !== "string" || !Number.isFinite(Date.parse(parsed.savedAt))) return null;
    const profile = parseLegacyProfile(JSON.stringify(parsed.profile));
    if (!profile || !Array.isArray(parsed.items)) return null;

    const meta = parsed.meta;
    if (
      isRecord(meta)
      && typeof meta.userId === "string"
      && meta.userId.trim().length > 0
      && meta.userId !== ownerId
    ) {
      return null;
    }

    const items = parsed.items.map(normalizeLegacyResultItem);
    if (items.some((item) => item === null)) return null;
    return {
      version: 2,
      ownerId,
      savedAt: new Date(parsed.savedAt).toISOString(),
      profile,
      meta: {
        ...(isRecord(meta) ? meta : {}),
        userId: ownerId,
      },
      items: items as StoredRecommendItemV1[],
    };
  } catch {
    return null;
  }
}

export function readLegacyRecommendStorageMap(storage: Pick<Storage, "getItem">): Record<string, string | null> {
  return Object.fromEntries(
    MIGRATABLE_LEGACY_RECOMMEND_KEYS.map((key) => [key, storage.getItem(key)]),
  );
}

export function countLegacyRecommendStorageEntries(map: StorageMap): number {
  return MIGRATABLE_LEGACY_RECOMMEND_KEYS.filter((key) => hasTextValue(map[key])).length;
}

export function hasLegacyRecommendStorage(storage: Pick<Storage, "getItem">): boolean {
  return countLegacyRecommendStorageEntries(readLegacyRecommendStorageMap(storage)) > 0;
}

export function legacyRecommendDismissSessionKey(ownerId: RecommendOwnerId): string {
  return `finance:recommend:legacy-dismissed:${encodeURIComponent(ownerId)}`;
}

export function buildLegacyRecommendMigration(
  ownerId: RecommendOwnerId,
  legacyMap: StorageMap,
  currentOwnerMap: StorageMap = {},
): LegacyRecommendMigrationPlan {
  const entries: MigrationEntry[] = [];
  const skippedLegacyKeys: LegacyRecommendKey[] = [];

  const legacyProfileRaw = legacyMap[LEGACY_RECOMMEND_PROFILE_KEY];
  if (hasTextValue(legacyProfileRaw)) {
    const ownerKey = recommendProfileStorageKey(ownerId);
    const profile = parseLegacyProfile(legacyProfileRaw);
    if (!profile || hasTextValue(currentOwnerMap[ownerKey])) {
      skippedLegacyKeys.push(LEGACY_RECOMMEND_PROFILE_KEY);
    } else {
      entries.push({
        legacyKey: LEGACY_RECOMMEND_PROFILE_KEY,
        ownerKey,
        value: JSON.stringify(buildStoredRecommendProfile(ownerId, profile)),
        itemCount: 1,
      });
    }
  }

  const legacyResultRaw = legacyMap[LEGACY_RECOMMEND_RESULT_KEY];
  if (hasTextValue(legacyResultRaw)) {
    const ownerKey = recommendResultStorageKey(ownerId);
    const result = parseLegacyResult(ownerId, legacyResultRaw);
    if (!result || hasTextValue(currentOwnerMap[ownerKey])) {
      skippedLegacyKeys.push(LEGACY_RECOMMEND_RESULT_KEY);
    } else {
      entries.push({
        legacyKey: LEGACY_RECOMMEND_RESULT_KEY,
        ownerKey,
        value: JSON.stringify(result),
        itemCount: 1,
      });
    }
  }

  const legacyRunsRaw = legacyMap[LEGACY_RECOMMEND_SAVED_RUNS_KEY];
  if (hasTextValue(legacyRunsRaw)) {
    const ownerKey = recommendOwnerStorageKey(ownerId, "saved-runs");
    const runs = buildOwnerSavedRunsFromLegacy(
      ownerId,
      legacyRunsRaw,
      hasTextValue(currentOwnerMap[ownerKey]) ? currentOwnerMap[ownerKey] : null,
    );
    if (!runs) {
      skippedLegacyKeys.push(LEGACY_RECOMMEND_SAVED_RUNS_KEY);
    } else {
      entries.push({
        legacyKey: LEGACY_RECOMMEND_SAVED_RUNS_KEY,
        ownerKey,
        value: runs.raw,
        itemCount: runs.migratedCount,
      });
    }
  }

  return {
    entries,
    ownerStorageMap: Object.fromEntries(entries.map((entry) => [entry.ownerKey, entry.value])),
    skippedLegacyKeys,
  };
}

export function buildLegacyRecommendBackupRestore(
  ownerId: RecommendOwnerId,
  backupStorageMap: Record<string, string | null>,
  liveOwnerMap: StorageMap,
): LegacyRecommendBackupRestorePlan {
  const ownerKeys = [
    recommendProfileStorageKey(ownerId),
    recommendResultStorageKey(ownerId),
    recommendOwnerStorageKey(ownerId, "saved-runs"),
  ];
  const migrationBaseline: StorageMap = { ...liveOwnerMap };
  for (const ownerKey of ownerKeys) {
    if (Object.prototype.hasOwnProperty.call(backupStorageMap, ownerKey)) {
      migrationBaseline[ownerKey] = backupStorageMap[ownerKey];
    }
  }

  const migration = buildLegacyRecommendMigration(
    ownerId,
    backupStorageMap,
    migrationBaseline,
  );
  return {
    clientStorageMap: {
      ...backupStorageMap,
      ...migration.ownerStorageMap,
    },
    migratedEntryCount: migration.entries.length,
    skippedLegacyKeys: migration.skippedLegacyKeys,
  };
}

export function migrateLegacyRecommendStorage(
  ownerId: RecommendOwnerId,
  storage: StorageLike,
): LegacyRecommendMigrationResult {
  const legacyMap = readLegacyRecommendStorageMap(storage);
  const currentOwnerMap = Object.fromEntries([
    recommendProfileStorageKey(ownerId),
    recommendResultStorageKey(ownerId),
    recommendOwnerStorageKey(ownerId, "saved-runs"),
  ].map((key) => [key, storage.getItem(key)]));
  const plan = buildLegacyRecommendMigration(ownerId, legacyMap, currentOwnerMap);
  const migratedLegacyKeys: LegacyRecommendKey[] = [];
  const failedLegacyKeys: LegacyRecommendKey[] = [];
  let migratedSavedRunCount = 0;

  for (const entry of plan.entries) {
    try {
      storage.setItem(entry.ownerKey, entry.value);
      storage.removeItem(entry.legacyKey);
      migratedLegacyKeys.push(entry.legacyKey);
      if (entry.legacyKey === LEGACY_RECOMMEND_SAVED_RUNS_KEY) {
        migratedSavedRunCount = entry.itemCount;
      }
    } catch {
      failedLegacyKeys.push(entry.legacyKey);
    }
  }

  const skippedLegacyKeys = [...new Set([...plan.skippedLegacyKeys, ...failedLegacyKeys])];
  const remainingLegacyKeys = MIGRATABLE_LEGACY_RECOMMEND_KEYS
    .filter((key) => hasTextValue(storage.getItem(key)));
  return {
    migratedLegacyKeys,
    skippedLegacyKeys,
    remainingLegacyKeys,
    migratedSavedRunCount,
  };
}
