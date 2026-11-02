import { DartCompanyPageClient } from "@/components/DartCompanyPageClient";
import { PUBLIC_PAGE_METADATA } from "@/lib/navigation/publicMetadata";

export const metadata = PUBLIC_PAGE_METADATA["/public/dart/company"];
export const dynamic = "force-dynamic";

export default function DartCompanyPage() {
  return <DartCompanyPageClient />;
}
