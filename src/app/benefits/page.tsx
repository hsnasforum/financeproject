import { BenefitsClient } from "@/components/BenefitsClient";

export default async function BenefitsPage({ searchParams }: { searchParams?: Promise<{ query?: string }> }) {
  const params = searchParams ? await searchParams : undefined;
  const initialQuery = typeof params?.query === "string" ? params.query : "주거";
  return <BenefitsClient initialQuery={initialQuery} />;
}
