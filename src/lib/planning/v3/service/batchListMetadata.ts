import { type ImportBatchMeta } from "@/lib/planning/v3/domain/transactions";
import {
  getStoredFirstPublicCreatedAtString,
  toStoredFirstPublicImportBatchMeta,
  type PublicImportBatchMeta,
} from "@/lib/planning/v3/service/storedFirstPublicMetadata";

export type BatchListLegacyMetaInput = {
  id: string;
  createdAt: string;
  total: number;
};

export type BatchListStoredMetaInput = {
  meta: ImportBatchMeta;
  metadataSource: "stored" | "synthetic";
};

export type BatchListMergedMeta = {
  meta: ImportBatchMeta;
  metadataSource: BatchListStoredMetaInput["metadataSource"] | "legacy-derived";
};

export type BatchListTieBreak = "id-asc" | "id-desc";

export function toBatchListMetaFromLegacy(batch: BatchListLegacyMetaInput): ImportBatchMeta {
  return {
    id: batch.id,
    createdAt: batch.createdAt,
    source: "csv",
    rowCount: Math.max(0, Math.trunc(Number(batch.total) || 0)),
  };
}

export function mergeBatchListMetadata(input: {
  legacyItems: BatchListLegacyMetaInput[];
  storedItems: BatchListStoredMetaInput[];
}): BatchListMergedMeta[] {
  const mergedById = new Map<string, BatchListMergedMeta>();

  for (const item of input.legacyItems) {
    mergedById.set(item.id, {
      meta: toBatchListMetaFromLegacy(item),
      metadataSource: "legacy-derived",
    });
  }
  for (const item of input.storedItems) {
    const existing = mergedById.get(item.meta.id);
    if (!existing) {
      mergedById.set(item.meta.id, item);
      continue;
    }
    const existingTs = Date.parse(existing.meta.createdAt);
    const nextTs = Date.parse(item.meta.createdAt);
    if (!Number.isFinite(existingTs) || (Number.isFinite(nextTs) && nextTs > existingTs)) {
      mergedById.set(item.meta.id, item);
    }
  }

  return [...mergedById.values()];
}

export function sortBatchListMetadataByCreatedAtDesc(
  items: BatchListMergedMeta[],
  options: { tieBreak: BatchListTieBreak },
): BatchListMergedMeta[] {
  return [...items].sort((left, right) => {
    const leftTs = Date.parse(left.meta.createdAt);
    const rightTs = Date.parse(right.meta.createdAt);
    if (Number.isFinite(leftTs) && Number.isFinite(rightTs) && leftTs !== rightTs) {
      return rightTs - leftTs;
    }
    return options.tieBreak === "id-asc"
      ? left.meta.id.localeCompare(right.meta.id)
      : right.meta.id.localeCompare(left.meta.id);
  });
}

export function toBatchListPublicImportBatchMeta(row: BatchListMergedMeta): PublicImportBatchMeta {
  return toStoredFirstPublicImportBatchMeta({
    meta: row.meta,
    metadataSource: row.metadataSource,
  });
}

export function getBatchListPublicCreatedAtString(row: BatchListMergedMeta): string {
  return getStoredFirstPublicCreatedAtString({
    createdAt: row.meta.createdAt,
    policy: { metadataSource: row.metadataSource },
  });
}
