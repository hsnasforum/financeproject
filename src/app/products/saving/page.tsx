import { headers } from "next/headers";
import { ProductListPage } from "@/components/ProductListPage";

export default async function SavingProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const topFinGrpNo = typeof params.topFinGrpNo === "string" ? params.topFinGrpNo : "020000";
  const pageNoRaw = typeof params.pageNo === "string" ? Number(params.pageNo) : 1;
  const pageNo = Number.isFinite(pageNoRaw) && pageNoRaw > 0 ? pageNoRaw : 1;
  const requestHeaders = await headers();
  const scriptNonce = requestHeaders.get("x-nonce") ?? undefined;

  return <ProductListPage kind="saving" title="적금 상품" ratePreference="higher" initialTopFinGrpNo={topFinGrpNo} initialPageNo={pageNo} scriptNonce={scriptNonce} />;
}
