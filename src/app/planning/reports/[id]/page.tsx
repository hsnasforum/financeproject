import PlanningReportDetailClient, { type PlanningReportDetail } from "@/components/PlanningReportDetailClient";
import {
  toPlanningPageLoadMessage,
  withCurrentPlanningPageUser,
} from "@/lib/planning/server/pageAuth";
import { getCurrentUserReport } from "@/lib/planning/server/reports/repository";
import {
  getCurrentUserRun,
  type CurrentUserPlanningRunRecord,
} from "@/lib/planning/server/runs/repository";

type PlanningReportDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function PlanningReportDetailPage(props: PlanningReportDetailPageProps) {
  const { id } = await props.params;

  let initialReport: PlanningReportDetail | null = null;
  let initialRun: CurrentUserPlanningRunRecord | null = null;
  let initialError = "";

  try {
    const loaded = await withCurrentPlanningPageUser(async () => {
      const found = await getCurrentUserReport(id);
      if (!found) return { report: null, run: null };

      let run: CurrentUserPlanningRunRecord | null = null;
      if (found.meta.runId) {
        try {
          run = await getCurrentUserRun(found.meta.runId);
        } catch (runError) {
          console.error("[planning/reports/detail] failed to load initial report run", runError);
        }
      }

      const report: PlanningReportDetail = {
        id: found.meta.id,
        createdAt: found.meta.createdAt,
        kind: found.meta.kind,
        ...(found.meta.runId ? { runId: found.meta.runId } : {}),
        ...(found.meta.recommendRunId ? { recommendRunId: found.meta.recommendRunId } : {}),
        markdown: found.markdown,
      };

      return { report, run };
    });

    initialReport = loaded.report;
    initialRun = loaded.run;
  } catch (error) {
    console.error("[planning/reports/detail] failed to load initial report detail", error);
    initialError = toPlanningPageLoadMessage(error, "리포트를 불러오지 못했습니다.");
  }

  return (
    <PlanningReportDetailClient
      id={id}
      initialError={initialError}
      initialReport={initialReport}
      initialRun={initialRun}
    />
  );
}
