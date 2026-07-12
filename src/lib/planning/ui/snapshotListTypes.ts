export type SnapshotListItem = {
  id: string;
  asOf?: string;
  fetchedAt?: string;
  staleDays?: number;
  korea?: {
    policyRatePct?: number;
    cpiYoYPct?: number;
    newDepositAvgPct?: number;
  };
  warningsCount?: number;
};
