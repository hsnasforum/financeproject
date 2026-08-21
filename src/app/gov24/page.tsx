import { Gov24Client } from "@/components/Gov24Client";
import { PUBLIC_PAGE_METADATA } from "@/lib/navigation/publicMetadata";

export const metadata = PUBLIC_PAGE_METADATA["/gov24"];

export default async function Gov24Page({ searchParams }: { searchParams?: Promise<{ q?: string }> }) {
  const params = searchParams ? await searchParams : undefined;
  const initialQuery = typeof params?.q === "string" ? params.q : "";
  return <Gov24Client initialQuery={initialQuery} />;
}
