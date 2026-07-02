export function parsePlanningStorageModeBoolean(value, fallback = false) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export function resolvePlanningStorageMode(env = process.env) {
  const nodeEnv = typeof env.NODE_ENV === "string" ? env.NODE_ENV.trim().toLowerCase() : "";
  const namespaceEnabled = parsePlanningStorageModeBoolean(env.PLANNING_NAMESPACE_ENABLED, false);
  const singleUserMode = parsePlanningStorageModeBoolean(env.PLANNING_SINGLE_USER_MODE, false);
  if (nodeEnv !== "production") return { ok: true, mode: "non-production" };
  if (namespaceEnabled) return { ok: true, mode: "multi-user-namespace" };
  if (singleUserMode) return { ok: true, mode: "single-user" };
  return {
    ok: false,
    mode: "invalid",
    message:
      "invalid planning storage mode: set PLANNING_NAMESPACE_ENABLED=true for multi-user storage or PLANNING_SINGLE_USER_MODE=true for explicit single-user storage",
  };
}

export function assertPlanningStorageMode(env = process.env) {
  const result = resolvePlanningStorageMode(env);
  if (result.ok) return result;
  throw new Error(result.message);
}
