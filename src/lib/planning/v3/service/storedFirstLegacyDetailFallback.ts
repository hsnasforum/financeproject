import { shouldExposeStoredFirstPublicCreatedAt } from "./storedFirstPublicMetadata";
import {
  type StoredFirstBatchReadResult,
  type StoredFirstLegacyBatchFallback,
} from "../transactions/store";

export type StoredFirstLegacyDetailFallbackClass =
  | "pure-legacy"
  | "old-stored-meta-importMetadata-gap"
  | "hybrid-legacy-summary-retained";

export type StoredFirstLegacyDetailSummaryRetentionWindow = {
  fallbackClass: StoredFirstLegacyDetailFallbackClass | null;
  retainsLegacyBatchFailed: boolean;
  retainsLegacyStatsFailedViaBatchAlias: boolean;
  retainsLegacyBatchFileName: boolean;
};

export type HistoricalNoMarkerProvenanceEvidenceSubset =
  | "marker-missing-but-otherwise-stable"
  | "origin-fundamentally-unresolved";

export type HistoricalNoMarkerProvenanceEvidence = {
  subset: HistoricalNoMarkerProvenanceEvidenceSubset;
  fallbackClass: StoredFirstLegacyDetailFallbackClass | null;
  importMetadataState: "missing" | "present";
  fileNameProvidedState: "missing";
  storedProvenanceFileNameState: "present" | "blank";
  legacyFileNameState: "present" | "blank";
};

const SAFE_SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function getStoredFirstLegacyDetailFallbackClass(
  read: Pick<StoredFirstBatchReadResult, "meta" | "policy">,
): StoredFirstLegacyDetailFallbackClass | null {
  if (!read.policy.needsLegacyDetailFallback) return null;
  if (read.policy.mode === "legacy-only") return "pure-legacy";
  if (
    read.policy.mode === "hybrid-legacy-transactions"
    && read.policy.metadataSource === "stored"
    && !read.meta.importMetadata
  ) {
    return "old-stored-meta-importMetadata-gap";
  }
  return "hybrid-legacy-summary-retained";
}

export function isOldStoredMetaImportMetadataGap(
  read: Pick<StoredFirstBatchReadResult, "meta" | "policy">,
): boolean {
  return getStoredFirstLegacyDetailFallbackClass(read) === "old-stored-meta-importMetadata-gap";
}

export function classifyHistoricalNoMarkerProvenanceEvidence(
  read: Pick<StoredFirstBatchReadResult, "meta" | "legacyBatch" | "policy">,
): HistoricalNoMarkerProvenanceEvidence | null {
  const fallbackClass = getStoredFirstLegacyDetailFallbackClass(read);
  const legacyFileName = asString(read.legacyBatch?.fileName);
  const legacyFileNameState = legacyFileName ? "present" : "blank";
  const importMetadata = read.meta.importMetadata;

  if (!importMetadata) {
    if (fallbackClass !== "old-stored-meta-importMetadata-gap") return null;
    return {
      subset: "origin-fundamentally-unresolved",
      fallbackClass,
      importMetadataState: "missing",
      fileNameProvidedState: "missing",
      storedProvenanceFileNameState: "blank",
      legacyFileNameState,
    };
  }

  if (typeof importMetadata.provenance.fileNameProvided === "boolean") return null;

  const storedFileName = asString(importMetadata.provenance.fileName);
  return {
    subset: storedFileName
      ? "marker-missing-but-otherwise-stable"
      : "origin-fundamentally-unresolved",
    fallbackClass,
    importMetadataState: "present",
    fileNameProvidedState: "missing",
    storedProvenanceFileNameState: storedFileName ? "present" : "blank",
    legacyFileNameState,
  };
}

export function hasHistoricalNoMarkerVisibleFileNameCompatBridge(
  read: Pick<StoredFirstBatchReadResult, "meta" | "legacyBatch" | "policy">,
): boolean {
  const evidence = classifyHistoricalNoMarkerProvenanceEvidence(read);
  if (!evidence) return false;
  if (evidence.subset !== "origin-fundamentally-unresolved") return false;
  return evidence.legacyFileNameState === "present";
}

export function hasStoredFirstReadOnlySourceBindingCandidate(
  read: Pick<StoredFirstBatchReadResult, "meta">,
): boolean {
  const importMetadata = read.meta.importMetadata;
  if (!importMetadata?.sourceBinding) return false;

  const artifactSha256 = asString(importMetadata.sourceBinding.artifactSha256).toLowerCase();
  const attestedFileName = asString(importMetadata.sourceBinding.attestedFileName);
  const storedProvenanceFileName = asString(importMetadata.provenance.fileName);

  if (!SAFE_SHA256_HEX_PATTERN.test(artifactSha256)) return false;
  if (!attestedFileName) return false;
  if (importMetadata.sourceBinding.originKind !== "writer-handoff") return false;
  return storedProvenanceFileName === attestedFileName;
}

export function hasHybridRetainedVisibleFileNameCompatBridge(
  read: Pick<StoredFirstBatchReadResult, "legacyBatch" | "meta" | "policy">,
): boolean {
  if (getStoredFirstLegacyDetailFallbackClass(read) !== "hybrid-legacy-summary-retained") return false;
  const storedFileName = asString(read.meta.importMetadata?.provenance.fileName);
  if (storedFileName) return false;
  return Boolean(asString(read.legacyBatch?.fileName));
}

export function getStoredFirstLegacyDetailSummaryRetentionWindow(
  read: Pick<StoredFirstBatchReadResult, "legacyBatch" | "meta" | "policy">,
): StoredFirstLegacyDetailSummaryRetentionWindow {
  const fallbackClass = getStoredFirstLegacyDetailFallbackClass(read);
  const retainsLegacyBatchFailed =
    fallbackClass === "pure-legacy" || fallbackClass === "old-stored-meta-importMetadata-gap";

  return {
    fallbackClass,
    retainsLegacyBatchFailed,
    retainsLegacyStatsFailedViaBatchAlias: retainsLegacyBatchFailed,
    retainsLegacyBatchFileName: retainsLegacyBatchFailed || hasHybridRetainedVisibleFileNameCompatBridge(read),
  };
}

export function getStoredFirstLegacyDetailSummaryFallback(
  read: Pick<StoredFirstBatchReadResult, "legacyBatch" | "meta" | "policy">,
): StoredFirstLegacyBatchFallback | null {
  // Detail route only uses this fallback for summary/count-style fields.
  // Row-derived projections continue to read raw or recovered transactions directly.
  if (!getStoredFirstLegacyDetailSummaryRetentionWindow(read).fallbackClass) return null;
  return read.legacyBatch ?? null;
}

export function getStoredFirstDetailBatchCreatedAt(
  read: Pick<StoredFirstBatchReadResult, "meta" | "policy" | "legacyBatch">,
): string {
  const shouldExposePublicCreatedAt = shouldExposeStoredFirstPublicCreatedAt({
    createdAt: read.meta.createdAt,
    policy: read.policy,
  });
  if (shouldExposePublicCreatedAt) return asString(read.meta.createdAt);
  // Detail route and summary route share the same public createdAt boundary.
  // Detail keeps a string contract, so it downgrades hidden createdAt to legacy fallback or "".
  return asString(getStoredFirstLegacyDetailSummaryFallback(read)?.createdAt);
}
