import { ProductListPage } from "@/components/ProductListPage";

export default async function DepositProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const topFinGrpNo = typeof params.topFinGrpNo === "string" ? params.topFinGrpNo : "020000";
  const query = typeof params.q === "string" ? params.q : "";
  const pageNoRaw = typeof params.pageNo === "string" ? Number(params.pageNo) : 1;
  const pageNo = Number.isFinite(pageNoRaw) && pageNoRaw > 0 ? pageNoRaw : 1;

  return <ProductListPage kind="deposit" title="예금 상품" initialTopFinGrpNo={topFinGrpNo} initialQuery={query} initialPageNo={pageNo} />;
}
