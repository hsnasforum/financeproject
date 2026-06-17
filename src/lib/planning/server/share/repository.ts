import {
  createShareReportFromRun,
  getShareReport,
  listShareReports,
  type ShareReportData,
  type ShareReportRef,
} from "./storage";
import { type MaskLevel } from "./mask";

export type CurrentUserShareReportRef = ShareReportRef;
export type CurrentUserShareReportData = ShareReportData;

export async function listCurrentUserShareReports(limit = 50): Promise<CurrentUserShareReportRef[]> {
  return listShareReports(limit);
}

export async function getCurrentUserShareReport(id: string): Promise<CurrentUserShareReportData | null> {
  return getShareReport(id);
}

export async function createCurrentUserShareReportFromRun(
  runId: string,
  level: MaskLevel = "standard",
): Promise<CurrentUserShareReportRef> {
  return createShareReportFromRun(runId, level);
}
