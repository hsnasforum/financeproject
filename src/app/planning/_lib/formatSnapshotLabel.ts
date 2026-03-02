export type SnapshotLabelItem = {
  id: string;
  asOf?: string;
  staleDays?: number;
  korea?: {
    policyRatePct?: number;
    cpiYoYPct?: number;
    newDepositAvgPct?: number;
  };
};

export type SnapshotFreshness = "ok" | "caution" | "risk";

export const SNAPSHOT_STALE_CAUTION_DAYS = 45;
export const SNAPSHOT_STALE_RISK_DAYS = 120;

function fmtPct(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `${value.toFixed(2)}%`;
}

export function getSnapshotFreshness(staleDays?: number): SnapshotFreshness {
  if (typeof staleDays !== "number" || !Number.isFinite(staleDays) || staleDays < 0) return "ok";
  if (staleDays >= SNAPSHOT_STALE_RISK_DAYS) return "risk";
  if (staleDays >= SNAPSHOT_STALE_CAUTION_DAYS) return "caution";
  return "ok";
}

export function formatSnapshotLabel(item: SnapshotLabelItem, kind: "latest" | "history" = "history"): string {
  const parts: string[] = [];
  if (kind === "latest") {
    parts.push("LATEST");
  } else {
    parts.push(item.id);
  }
  if (item.asOf) parts.push(`asOf ${item.asOf}`);

  const policyRate = fmtPct(item.korea?.policyRatePct);
  const cpi = fmtPct(item.korea?.cpiYoYPct);
  const deposit = fmtPct(item.korea?.newDepositAvgPct);

  if (kind === "latest") {
    if (policyRate) parts.push(`기준금리 ${policyRate}`);
    if (cpi) parts.push(`CPI ${cpi}`);
    if (deposit) parts.push(`예금 ${deposit}`);
  } else {
    if (policyRate || cpi) {
      parts.push(`${policyRate ?? "-"} / ${cpi ?? "-"}`);
    } else if (deposit) {
      parts.push(`예금 ${deposit}`);
    }
  }

  if (typeof item.staleDays === "number" && Number.isFinite(item.staleDays)) {
    parts.push(`(stale ${Math.max(0, Math.trunc(item.staleDays))}d)`);
  }
  return parts.join(" · ");
}
