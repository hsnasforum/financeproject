import PlanningReportDetailClient, { type PlanningReportDetail } from "@/components/PlanningReportDetailClient";
import {
  loadPlanningReportDetailPageInitialData,
  type PlanningReportDetailPageInitialData,
} from "@/lib/planning/server/pages/planningRscLoaders";

type PlanningReportDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function PlanningReportDetailPage(props: PlanningReportDetailPageProps) {
  const { id } = await props.params;

  let initialReport: PlanningReportDetail | null = null;
  let initialRun: PlanningReportDetailPageInitialData["initialRun"] = null;
  let initialError = "";

  const loaded = await loadPlanningReportDetailPageInitialData(id);
  initialReport = loaded.initialReport;
  initialRun = loaded.initialRun;
  initialError = loaded.initialError;

  return (
    <PlanningReportDetailClient
      id={id}
      initialError={initialError}
      initialReport={initialReport}
      initialRun={initialRun}
    />
  );
}
