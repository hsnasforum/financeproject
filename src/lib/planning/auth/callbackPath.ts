// Internal callback paths for re-authentication. The dashboard variant carries a selection query that
// app/dashboard/_lib/dashboardProfileSelection.ts builds from a validated profile id only.
export type DashboardAuthCallbackPath = "/dashboard" | `/dashboard?profileId=${string}`;
