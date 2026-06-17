import {
  createReportFromRun,
  deleteReport,
  getReport,
  hardDeleteReportFromTrash,
  listReports,
  restoreReportFromTrash,
  type PlanningReportData,
  type PlanningReportListItem,
} from "./storage";

export type CurrentUserPlanningReportListItem = PlanningReportListItem;
export type CurrentUserPlanningReportData = PlanningReportData;

export async function listCurrentUserReports(limit = 50): Promise<CurrentUserPlanningReportListItem[]> {
  return listReports(limit);
}

export async function getCurrentUserReport(id: string): Promise<CurrentUserPlanningReportData | null> {
  return getReport(id);
}

export async function createCurrentUserReportFromRun(
  runId: string,
  options: { recommendRunId?: string } = {},
): Promise<{ id: string }> {
  return createReportFromRun(runId, options);
}

export async function deleteCurrentUserReport(id: string): Promise<boolean> {
  return deleteReport(id);
}

export async function restoreCurrentUserReportFromTrash(id: string): Promise<boolean> {
  return restoreReportFromTrash(id);
}

export async function hardDeleteCurrentUserReportFromTrash(id: string): Promise<boolean> {
  return hardDeleteReportFromTrash(id);
}
