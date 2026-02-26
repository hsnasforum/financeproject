import { BenefitsClient } from "@/components/BenefitsClient";

export default async function BenefitsPage({
  searchParams,
}: {
  searchParams?: Promise<{ query?: string; q?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const q = (typeof params?.q === "string" ? params.q : typeof params?.query === "string" ? params.query : "").trim();
  return <BenefitsClient initialQuery={q} />;
}
