export const PLANNING_SELECTED_PROFILE_STORAGE_KEY = "planning:v2:selectedProfileId";

export function normalizeProfileId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function appendProfileIdQuery(basePath: string, profileId: string): string {
  const safeProfileId = normalizeProfileId(profileId);
  if (!safeProfileId) return basePath;
  const separator = basePath.includes("?") ? "&" : "?";
  return `${basePath}${separator}profileId=${encodeURIComponent(safeProfileId)}`;
}
