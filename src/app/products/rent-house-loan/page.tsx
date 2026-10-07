import { headers } from "next/headers";
import { ProductListPage } from "@/components/ProductListPage";
import { PUBLIC_PAGE_METADATA } from "@/lib/navigation/publicMetadata";

export const metadata = PUBLIC_PAGE_METADATA["/products/rent-house-loan"];

export default async function RentHouseLoanProductsPage({
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

  return <ProductListPage kind="rent-house-loan" title="전세자금대출 상품" ratePreference="lower" initialTopFinGrpNo={topFinGrpNo} initialPageNo={pageNo} scriptNonce={scriptNonce} />;
}
