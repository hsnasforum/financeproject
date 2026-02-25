import { ProductListPage } from "@/components/ProductListPage";

export default async function MortgageLoanProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const topFinGrpNo = typeof params.topFinGrpNo === "string" ? params.topFinGrpNo : "020000";
  const pageNoRaw = typeof params.pageNo === "string" ? Number(params.pageNo) : 1;
  const pageNo = Number.isFinite(pageNoRaw) && pageNoRaw > 0 ? pageNoRaw : 1;

  return <ProductListPage kind="mortgage-loan" title="주택담보대출 상품" ratePreference="lower" initialTopFinGrpNo={topFinGrpNo} initialPageNo={pageNo} />;
}
