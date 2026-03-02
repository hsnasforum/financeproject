export type AssumptionsSnapshot = {
  version: 1;
  schemaVersion?: 2;
  asOf: string;
  fetchedAt: string;
  korea: {
    policyRatePct?: number;
    callOvernightPct?: number;
    cd91Pct?: number;
    koribor3mPct?: number;
    msb364Pct?: number;
    baseRatePct?: number;
    cpiYoYPct?: number;
    coreCpiYoYPct?: number;
    newDepositAvgPct?: number;
    newLoanAvgPct?: number;
    depositOutstandingAvgPct?: number;
    loanOutstandingAvgPct?: number;
  };
  sources: Array<{ name: string; url: string; fetchedAt: string }>;
  warnings: string[];
};
