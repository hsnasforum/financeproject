import { ProductListPage } from "@/components/ProductListPage";

export default async function CreditLoanProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const topFinGrpNo = typeof params.topFinGrpNo === "string" ? params.topFinGrpNo : "020000";
  const pageNoRaw = typeof params.pageNo === "string" ? Number(params.pageNo) : 1;
  const pageNo = Number.isFinite(pageNoRaw) && pageNoRaw > 0 ? pageNoRaw : 1;

  return <ProductListPage kind="credit-loan" title="개인신용대출 상품" ratePreference="lower" initialTopFinGrpNo={topFinGrpNo} initialPageNo={pageNo} />;
}
