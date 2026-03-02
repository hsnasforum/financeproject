import PlanningRunsClient from "@/components/PlanningRunsClient";
import { getPlanningFeatureFlags } from "@/lib/planning/config";

type PlanningRunDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function PlanningRunDetailPage(props: PlanningRunDetailPageProps) {
  const { id } = await props.params;
  const featureFlags = getPlanningFeatureFlags();
  return <PlanningRunsClient initialSelectedRunId={id} pdfEnabled={featureFlags.pdfEnabled} />;
}

