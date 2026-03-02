import { HousingAffordClient } from "@/components/HousingAffordClient";
import { parseAffordInit } from "@/lib/housing/affordQuery";

type AffordPageSearchParams = {
  incomeNet?: string | string[];
  outflow?: string | string[];
  mode?: string | string[];
  deposit?: string | string[];
  monthlyRent?: string | string[];
  opportunityAprPct?: string | string[];
  purchasePrice?: string | string[];
  equity?: string | string[];
  loanAprPct?: string | string[];
  termMonths?: string | string[];
};

export default async function HousingAffordPage({ searchParams }: { searchParams?: Promise<AffordPageSearchParams> }) {
  const params = searchParams ? await searchParams : undefined;
  const initial = parseAffordInit(params);

  return (
    <HousingAffordClient
      initialIncomeNet={initial.incomeNet}
      initialOutflow={initial.outflow}
      initialMode={initial.mode}
      initialDeposit={initial.deposit}
      initialMonthlyRent={initial.monthlyRent}
      initialOpportunityAprPct={initial.opportunityAprPct}
      initialPurchasePrice={initial.purchasePrice}
      initialEquity={initial.equity}
      initialLoanAprPct={initial.loanAprPct}
      initialTermMonths={initial.termMonths}
    />
  );
}
