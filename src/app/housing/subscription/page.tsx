import { SubscriptionClient } from "@/components/SubscriptionClient";

export default async function SubscriptionPage({ searchParams }: { searchParams?: Promise<{ region?: string }> }) {
  const params = searchParams ? await searchParams : undefined;
  const initialRegion = typeof params?.region === "string" ? params.region : "서울";
  return <SubscriptionClient initialRegion={initialRegion} />;
}
