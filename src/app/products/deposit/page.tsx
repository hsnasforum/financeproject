import { redirect } from "next/navigation";
import { buildCatalogPresetHref } from "@/lib/products/catalogExplorer";

export default async function DepositProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  redirect(buildCatalogPresetHref("deposit", params));
}
