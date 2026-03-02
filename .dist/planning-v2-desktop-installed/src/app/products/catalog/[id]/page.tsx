import { UnifiedProductDetailClient } from "@/components/UnifiedProductDetailClient";

type DetailPageParams = {
  id?: string;
};

export default async function UnifiedProductDetailPage({
  params,
}: {
  params: Promise<DetailPageParams>;
}) {
  const resolved = await params;
  const rawId = typeof resolved.id === "string" ? resolved.id : "";
  const id = rawId ? decodeURIComponent(rawId) : "";
  return <UnifiedProductDetailClient id={id} />;
}
