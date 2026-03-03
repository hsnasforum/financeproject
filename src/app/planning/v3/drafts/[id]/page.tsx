import { DraftDetailClient } from "./_components/DraftDetailClient";

type PlanningV3DraftDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function PlanningV3DraftDetailPage(props: PlanningV3DraftDetailPageProps) {
  const { id } = await props.params;
  return <DraftDetailClient id={id} />;
}

