import { DraftDetailClient } from "./_components/DraftDetailClient";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function PlanningV3DraftDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <DraftDetailClient id={id} />;
}
