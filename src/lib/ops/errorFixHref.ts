function normalizeCode(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toUpperCase() : "";
}

export function inferFixHrefByErrorCode(rawCode: unknown): string | undefined {
  const code = normalizeCode(rawCode);
  if (!code) return undefined;

  if (code === "LOCKED" || code === "VAULT_LOCKED" || code.startsWith("VAULT_UNLOCK_BACKOFF")) {
    return "/ops/security";
  }
  if (
    code === "STALE_ASSUMPTIONS"
    || code === "SNAPSHOT_STALE"
    || code === "SNAPSHOT_VERY_STALE"
    || code === "SNAPSHOT_NOT_FOUND"
  ) {
    return "/ops/assumptions";
  }
  if (
    code === "STORAGE_CORRUPT"
    || code === "MIGRATION_FAILED"
    || code === "READ_FAILED"
    || code === "PARSE_FAILED"
    || code.startsWith("STORAGE_")
  ) {
    return "/ops/doctor";
  }
  if (
    code === "BACKUP_INVALID"
    || code === "INVALID_ARCHIVE"
    || code === "INVALID_ZIP"
    || code.startsWith("MANIFEST_")
    || code.startsWith("ZIP_")
    || code.startsWith("ENCRYPTED_PACKAGE_")
  ) {
    return "/ops/backup";
  }
  return undefined;
}
