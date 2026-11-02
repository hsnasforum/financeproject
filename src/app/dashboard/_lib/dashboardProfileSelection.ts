// URL selection for /dashboard?profileId=<id>. The query only chooses which of the current user's
// profiles is shown; it never changes the stored default profile.
import type { DashboardAuthCallbackPath } from "@/lib/planning/auth/callbackPath";

// Defined in src/lib so components can use it without importing app modules.
export type { DashboardAuthCallbackPath };

export type DashboardProfileSelectionRequest =
  | { kind: "none" }
  | { kind: "requested"; profileId: string }
  | { kind: "invalid" };

// Profile ids are store record ids (UUIDs or the seeded "default-profile").
const DASHBOARD_PROFILE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function isDashboardProfileId(value: string): boolean {
  return DASHBOARD_PROFILE_ID_PATTERN.test(value);
}

// A repeated, empty or malformed profileId is an explicit but unusable selection, not "no selection".
export function parseDashboardProfileSelection(raw: string | string[] | undefined): DashboardProfileSelectionRequest {
  if (raw === undefined) return { kind: "none" };
  if (Array.isArray(raw)) return { kind: "invalid" };
  const profileId = raw.trim();
  return isDashboardProfileId(profileId) ? { kind: "requested", profileId } : { kind: "invalid" };
}

// Only a validated id is carried back after re-authentication. An unusable explicit selection returns to
// an empty profileId, which parses as invalid again, so recovery never turns it into the default view.
export function buildDashboardAuthCallbackPath(selection: DashboardProfileSelectionRequest): DashboardAuthCallbackPath {
  if (selection.kind === "requested") return `/dashboard?profileId=${encodeURIComponent(selection.profileId)}`;
  return selection.kind === "invalid" ? "/dashboard?profileId=" : "/dashboard";
}
