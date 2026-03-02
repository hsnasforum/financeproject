import { FeedbackDetailClient } from "@/components/FeedbackDetailClient";

type PageParams = {
  id: string;
};

type FeedbackDetailPageProps = {
  params: Promise<PageParams>;
};

export default async function FeedbackDetailPage({ params }: FeedbackDetailPageProps) {
  const { id } = await params;
  return <FeedbackDetailClient id={id} />;
}
