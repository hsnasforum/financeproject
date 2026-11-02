import PlanningRunsClient from "@/components/PlanningRunsClient";
import { PUBLIC_PAGE_METADATA } from "@/lib/navigation/publicMetadata";

export const metadata = PUBLIC_PAGE_METADATA["/planning/runs/[id]"];

type PlanningRunDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function PlanningRunDetailPage(props: PlanningRunDetailPageProps) {
  const { id } = await props.params;
  return <PlanningRunsClient initialSelectedRunId={id} />;
}
