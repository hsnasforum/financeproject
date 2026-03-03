import { TransactionBatchDetailClient } from "../../[id]/_components/TransactionBatchDetailClient";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function PlanningV3TransactionBatchDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <TransactionBatchDetailClient id={id} />;
}
