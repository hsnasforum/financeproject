import { BatchSummaryClient } from "./_components/BatchSummaryClient";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function PlanningV3BatchSummaryPage({ params }: PageProps) {
  const { id } = await params;
  return <BatchSummaryClient id={id} />;
}

