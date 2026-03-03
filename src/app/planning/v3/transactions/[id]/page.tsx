import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function PlanningV3TransactionBatchDetailPage(props: PageProps) {
  const { id } = await props.params;
  redirect(`/planning/v3/transactions/batches/${encodeURIComponent(id)}`);
}
