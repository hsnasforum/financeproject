import { SubscriptionClient } from "@/components/SubscriptionClient";
import { parseSubscriptionInit } from "@/lib/publicApis/subscriptionQuery";

type SubscriptionPageSearchParams = {
  region?: string | string[];
  from?: string | string[];
  to?: string | string[];
  q?: string | string[];
  houseType?: string | string[];
  mode?: string | string[];
};

export default async function SubscriptionPage({ searchParams }: { searchParams?: Promise<SubscriptionPageSearchParams> }) {
  const params = searchParams ? await searchParams : undefined;
  const initial = parseSubscriptionInit(params);
  return (
    <SubscriptionClient
      initialRegion={initial.region}
      initialFrom={initial.from}
      initialTo={initial.to}
      initialQuery={initial.q}
      initialHouseType={initial.houseType}
      initialMode={initial.mode}
    />
  );
}
