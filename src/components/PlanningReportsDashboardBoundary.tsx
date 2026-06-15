import PlanningReportsDashboardClient from "@/components/PlanningReportsDashboardClient";
import { type PlanningRunRecord } from "@/lib/planning/store/types";

type PlanningReportsDashboardBoundaryProps = {
  initialBaseRunId?: string;
  initialRuns?: PlanningRunRecord[];
  initialProfileId?: string;
  initialRunId?: string;
  initialLoadNotice?: string;
};

export default function PlanningReportsDashboardBoundary({
  initialBaseRunId,
  ...props
}: PlanningReportsDashboardBoundaryProps) {
  const clientKey = [
    props.initialProfileId ?? "",
    props.initialRunId ?? "",
    initialBaseRunId ?? "",
    props.initialRuns?.map((run) => run.id).join(",") ?? "async",
  ].join(":");

  return <PlanningReportsDashboardClient key={clientKey} {...props} />;
}
