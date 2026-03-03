import { TransactionBatchDetailClient } from "../../[id]/_components/TransactionBatchDetailClient";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function PlanningV3TransactionBatchDetailByBatchesPage(props: PageProps) {
  const { id } = await props.params;
  return <TransactionBatchDetailClient id={id} />;
}
