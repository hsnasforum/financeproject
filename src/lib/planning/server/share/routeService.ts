import { type MaskLevel } from "./mask";
import {
  createCurrentUserShareReportFromRun,
  listCurrentUserShareReports,
  type CurrentUserShareReportRef,
} from "./repository";

export type CurrentUserShareReportResponseItem = {
  id: string;
  runId: string;
  level: MaskLevel;
  createdAt: string;
};

function toResponseItem(report: CurrentUserShareReportRef): CurrentUserShareReportResponseItem {
  return {
    id: report.id,
    runId: report.runId,
    level: report.level,
    createdAt: report.createdAt,
  };
}

export async function listCurrentUserShareReportResponseData(
  limit: number,
): Promise<CurrentUserShareReportResponseItem[]> {
  const rows = await listCurrentUserShareReports(limit);
  return rows.map(toResponseItem);
}

export async function createCurrentUserShareReportResponseData(input: {
  runId: string;
  level: MaskLevel;
}): Promise<CurrentUserShareReportResponseItem> {
  const report = await createCurrentUserShareReportFromRun(input.runId, input.level);
  return toResponseItem(report);
}
