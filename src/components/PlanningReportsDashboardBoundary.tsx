import PlanningReportsDashboardClient from "@/components/PlanningReportsDashboardClient";
import { type PlanningRunRecord } from "@/lib/planning/store/types";

type PlanningReportsDashboardBoundaryProps = {
  initialRuns?: PlanningRunRecord[];
  initialProfileId?: string;
  initialRunId?: string;
  initialLoadNotice?: string;
};

export default function PlanningReportsDashboardBoundary(props: PlanningReportsDashboardBoundaryProps) {
  return <PlanningReportsDashboardClient {...props} />;
}
