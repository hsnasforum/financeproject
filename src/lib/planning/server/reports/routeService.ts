import { append as appendAuditLog } from "../../../audit/auditLogStore";
import {
  createCurrentUserReportFromRun,
  deleteCurrentUserReport,
  getCurrentUserReport,
  listCurrentUserReports,
} from "./repository";

export type CurrentUserReportListResponseItem = {
  id: string;
  createdAt: string;
  kind: "run" | "manual";
  runId?: string;
  recommendRunId?: string;
};

export type CurrentUserReportDetailResponseData = {
  id: string;
  createdAt: string;
  kind: "run" | "manual";
  runId?: string;
  recommendRunId?: string;
  markdown: string;
};

type ReportTrashAuditResult = "SUCCESS" | "ERROR" | "REJECTED";

function appendTrashMoveAudit(input: {
  result: ReportTrashAuditResult;
  id: string;
  message: string;
}) {
  try {
    appendAuditLog({
      event: "PLANNING_TRASH_MOVE",
      route: "/api/planning/v2/reports/[id]",
      summary: `PLANNING_TRASH_MOVE ${input.result}: ${input.message}`,
      details: {
        result: input.result,
        kind: "report",
        id: input.id,
        message: input.message,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append planning trash move audit", error);
  }
}

export async function listCurrentUserReportResponseData(
  limit: number,
): Promise<CurrentUserReportListResponseItem[]> {
  const rows = await listCurrentUserReports(limit);
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    kind: row.kind,
    ...(row.runId ? { runId: row.runId } : {}),
    ...(row.recommendRunId ? { recommendRunId: row.recommendRunId } : {}),
  }));
}

export async function createCurrentUserReportResponseData(input: {
  runId: string;
  recommendRunId?: string;
}): Promise<{ id: string }> {
  return createCurrentUserReportFromRun(input.runId, {
    ...(input.recommendRunId ? { recommendRunId: input.recommendRunId } : {}),
  });
}

export async function getCurrentUserReportDetailResponseData(
  reportId: string,
): Promise<CurrentUserReportDetailResponseData | null> {
  const found = await getCurrentUserReport(reportId);
  if (!found) return null;

  return {
    id: found.meta.id,
    createdAt: found.meta.createdAt,
    kind: found.meta.kind,
    ...(found.meta.runId ? { runId: found.meta.runId } : {}),
    ...(found.meta.recommendRunId ? { recommendRunId: found.meta.recommendRunId } : {}),
    markdown: found.markdown,
  };
}

export function recordCurrentUserReportDeleteRejected(input: {
  reportId: string;
  message: string;
}): void {
  appendTrashMoveAudit({
    result: "REJECTED",
    id: input.reportId,
    message: input.message,
  });
}

export async function deleteCurrentUserReportToTrash(
  reportId: string,
): Promise<{ deleted: boolean }> {
  try {
    const deleted = await deleteCurrentUserReport(reportId);
    if (!deleted) return { deleted: false };

    appendTrashMoveAudit({
      result: "SUCCESS",
      id: reportId,
      message: "planning report moved to trash",
    });
    return { deleted: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "리포트 삭제에 실패했습니다.";
    appendTrashMoveAudit({
      result: "ERROR",
      id: reportId,
      message,
    });
    throw error;
  }
}
