import { parseHousingAfford, type HousingAffordMode } from "../schemas/housingAfford";

export type { HousingAffordMode };

export type AffordInit = {
  incomeNet: number;
  outflow: number;
  mode: HousingAffordMode;
  deposit: number;
  monthlyRent: number;
  opportunityAprPct: number;
  purchasePrice: number;
  equity: number;
  loanAprPct: number;
  termMonths: number;
};

type RawParams = URLSearchParams | Record<string, string | string[] | undefined> | null | undefined;

export function parseAffordInit(params: RawParams): AffordInit {
  const parsed = parseHousingAfford(params);
  return parsed.value;
}
