const BACKUP_BUNDLE_VERSION = 1 as const;

export const PLANNING_BACKUP_REQUIRED_EXACT = [
  ".data/planning/assumptions.latest.json",
] as const;

export const PLANNING_BACKUP_REQUIRED_PATTERNS = [
  /^\.data\/planning\/assumptions\/history\/[^/]+\.json$/,
  /^\.data\/planning\/profiles\/[^/]+\.json$/,
  /^\.data\/planning\/runs\/[^/]+\.json$/,
] as const;

export const PLANNING_BACKUP_OPTIONAL_EXACT = [
  ".data/planning/eval/latest.json",
] as const;

export const PLANNING_BACKUP_OPTIONAL_PATTERNS = [
  /^\.data\/planning\/cache\/[^/]+\.json$/,
  /^\.data\/planning\/eval\/history\/[^/]+\.json$/,
] as const;

export const SERVER_PATH_WHITELIST_EXACT = [
  "tmp/user_feedback.json",
  "tmp/daily_refresh_result.json",
  ".data/ops/auto-merge-policy.json",
  ...PLANNING_BACKUP_REQUIRED_EXACT,
  ...PLANNING_BACKUP_OPTIONAL_EXACT,
  "tmp/dart/disclosure_alerts.json",
  "tmp/dart/disclosure_digest.json",
  "tmp/dart/disclosure_digest.prev.json",
  "tmp/dart/disclosure_state.json",
  "tmp/dart/daily_brief.json",
] as const;

export const SERVER_PATH_WHITELIST_PATTERNS = [
  /^tmp\/dart\/[^/]+\.json$/,
  ...PLANNING_BACKUP_REQUIRED_PATTERNS,
  ...PLANNING_BACKUP_OPTIONAL_PATTERNS,
] as const;

export const DEFAULT_SERVER_EXPORT_PATHS = [
  ...SERVER_PATH_WHITELIST_EXACT,
] as const;

export const CLIENT_STORAGE_WHITELIST = [
  "planner:last",
  "planner_last_snapshot_v1",
  "recommend_profile_v1",
  "recommend_last_result_v1",
  "recommend-hub:v1",
  "products_shelf_v1",
  "products_compare_ids_v1",
  "finlife_planner_snapshots_v1",
  "finlife_planner_link_open_mode_v1",
  "finlife_planner_checklist_checked_v1",
  "dart_alert_prefs_v1",
  "dart_alert_profile_v1",
  "dart_alert_rules_v1",
  "freshness:autoSmoke",
] as const;

export type BackupBundle = {
  version: typeof BACKUP_BUNDLE_VERSION;
  generatedAt: string;
  serverFiles: Record<string, string | null>;
  clientStorage: Record<string, string | null>;
};

type BuildBundleInput = {
  serverFilesMap: Record<string, string | null>;
  clientStorageMap: Record<string, string | null>;
};

export type ValidateBundleResult =
  | { ok: true }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeTextMap(input: Record<string, string | null>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = String(rawKey ?? "").trim().replaceAll("\\", "/");
    if (!key) continue;
    if (typeof rawValue === "string") {
      out[key] = rawValue;
      continue;
    }
    out[key] = null;
  }
  return out;
}

export function isServerPathWhitelisted(relativePath: string): boolean {
  const normalized = String(relativePath ?? "").trim().replaceAll("\\", "/");
  if (!normalized) return false;
  if ((SERVER_PATH_WHITELIST_EXACT as readonly string[]).includes(normalized)) return true;
  return SERVER_PATH_WHITELIST_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isClientStorageKeyWhitelisted(key: string): boolean {
  const normalized = String(key ?? "").trim();
  if (!normalized) return false;
  return (CLIENT_STORAGE_WHITELIST as readonly string[]).includes(normalized);
}

export function buildBundle({ serverFilesMap, clientStorageMap }: BuildBundleInput): BackupBundle {
  return {
    version: BACKUP_BUNDLE_VERSION,
    generatedAt: new Date().toISOString(),
    serverFiles: sanitizeTextMap(serverFilesMap),
    clientStorage: sanitizeTextMap(clientStorageMap),
  };
}

export function validateBundle(bundle: unknown): ValidateBundleResult {
  if (!isRecord(bundle)) {
    return { ok: false, error: "bundle은 객체여야 합니다." };
  }

  if (bundle.version !== BACKUP_BUNDLE_VERSION) {
    return { ok: false, error: `bundle.version은 ${BACKUP_BUNDLE_VERSION} 이어야 합니다.` };
  }

  if (typeof bundle.generatedAt !== "string" || !bundle.generatedAt.trim()) {
    return { ok: false, error: "generatedAt은 문자열이어야 합니다." };
  }
  if (!Number.isFinite(Date.parse(bundle.generatedAt))) {
    return { ok: false, error: "generatedAt 형식이 올바르지 않습니다." };
  }

  if (!isRecord(bundle.serverFiles)) {
    return { ok: false, error: "serverFiles는 객체여야 합니다." };
  }
  for (const [rawPath, content] of Object.entries(bundle.serverFiles)) {
    const normalizedPath = String(rawPath ?? "").trim().replaceAll("\\", "/");
    if (!isServerPathWhitelisted(normalizedPath)) {
      return { ok: false, error: `허용되지 않은 server path: ${normalizedPath}` };
    }
    if (!(typeof content === "string" || content === null)) {
      return { ok: false, error: `serverFiles.${normalizedPath} 값은 string|null 이어야 합니다.` };
    }
  }

  if (!isRecord(bundle.clientStorage)) {
    return { ok: false, error: "clientStorage는 객체여야 합니다." };
  }
  for (const [rawKey, value] of Object.entries(bundle.clientStorage)) {
    const key = String(rawKey ?? "").trim();
    if (!isClientStorageKeyWhitelisted(key)) {
      return { ok: false, error: `허용되지 않은 clientStorage key: ${key}` };
    }
    if (!(typeof value === "string" || value === null)) {
      return { ok: false, error: `clientStorage.${key} 값은 string|null 이어야 합니다.` };
    }
  }

  return { ok: true };
}
