import { DraftDetailClient } from "./_components/DraftDetailClient";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function PlanningV3DraftDetailPage(props: PageProps) {
  const { id } = await props.params;
  return <DraftDetailClient id={id} />;
}
