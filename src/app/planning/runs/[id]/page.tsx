import PlanningRunsClient from "@/components/PlanningRunsClient";

type PlanningRunDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function PlanningRunDetailPage(props: PlanningRunDetailPageProps) {
  const { id } = await props.params;
  return <PlanningRunsClient initialSelectedRunId={id} />;
}
