import { InvestCompaniesClient } from "@/components/InvestCompaniesClient";
import { PUBLIC_PAGE_METADATA } from "@/lib/navigation/publicMetadata";

export const metadata = PUBLIC_PAGE_METADATA["/invest/companies"];

export default function InvestCompaniesPage() {
  return <InvestCompaniesClient />;
}
