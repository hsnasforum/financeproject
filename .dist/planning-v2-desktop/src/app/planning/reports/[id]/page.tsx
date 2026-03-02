import PlanningReportDetailClient from "@/components/PlanningReportDetailClient";

type PlanningReportDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function PlanningReportDetailPage(props: PlanningReportDetailPageProps) {
  const { id } = await props.params;
  return <PlanningReportDetailClient id={id} />;
}
