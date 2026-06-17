import { type ImportBatchMeta } from "@/lib/planning/v3/domain/transactions";

export type PublicImportBatchMeta = Omit<ImportBatchMeta, "createdAt" | "importMetadata"> & {
  createdAt?: string;
};

export type StoredFirstPublicCreatedAtPolicy = {
  metadataSource: "stored" | "legacy-derived" | "synthetic";
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function shouldExposeStoredFirstPublicCreatedAt(input: {
  createdAt?: string;
  policy: StoredFirstPublicCreatedAtPolicy;
}): boolean {
  return Boolean(asString(input.createdAt)) && input.policy.metadataSource !== "synthetic";
}

export function getStoredFirstPublicCreatedAt(input: {
  createdAt?: string;
  policy: StoredFirstPublicCreatedAtPolicy;
}): string | undefined {
  if (!shouldExposeStoredFirstPublicCreatedAt(input)) return undefined;
  return asString(input.createdAt);
}

export function getStoredFirstPublicCreatedAtString(input: {
  createdAt?: string;
  policy: StoredFirstPublicCreatedAtPolicy;
}): string {
  // Some legacy/user-facing list surfaces still keep a string createdAt contract.
  // Those routes preserve the key and downgrade hidden public createdAt to "".
  return asString(getStoredFirstPublicCreatedAt(input));
}

export function toStoredFirstPublicImportBatchMeta(input: {
  meta: ImportBatchMeta;
  metadataSource: StoredFirstPublicCreatedAtPolicy["metadataSource"];
}): PublicImportBatchMeta {
  const publicMeta = { ...input.meta } as ImportBatchMeta;
  delete publicMeta.importMetadata;
  const createdAt = getStoredFirstPublicCreatedAt({
    createdAt: input.meta.createdAt,
    policy: { metadataSource: input.metadataSource },
  });
  if (createdAt) {
    return {
      ...publicMeta,
      createdAt,
    };
  }
  // Summary/batch-center style surfaces can omit hidden public createdAt entirely.
  const rest: PublicImportBatchMeta = { ...publicMeta };
  delete rest.createdAt;
  return rest;
}
