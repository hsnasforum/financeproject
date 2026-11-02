import { PensionProductsClient } from "@/components/products/PensionProductsClient";
import { PUBLIC_PAGE_METADATA } from "@/lib/navigation/publicMetadata";
import { FSS_PENSION_PAGES } from "@/lib/publicApis/providers/fssPension.mjs";

export const metadata = PUBLIC_PAGE_METADATA["/products/pension"];

export default async function PensionProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const initialTab = params.tab === "products" ? "products" : "guaranteed";

  return <PensionProductsClient initialTab={initialTab} sourcePages={FSS_PENSION_PAGES} />;
}
