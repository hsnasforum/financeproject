export type AllocationPolicyId = "balanced" | "safety" | "growth";

export type AllocationPolicy = {
  id: AllocationPolicyId;
  title: string;
  rules: {
    emergencyFirst: boolean;
    minEmergencyMonths: number;
    debtExtraPaymentPctOfSurplus?: number;
    investMinPctOfSurplus?: number;
    lumpSumReservePctOfSurplus?: number;
  };
  guards: {
    neverGoNegativeCash: boolean;
    stopInvestWhenEmergencyShort: boolean;
  };
};
