import { type AllocationPolicy, type AllocationPolicyId } from "./types";

export const POLICY_PRESETS: Record<AllocationPolicyId, AllocationPolicy> = {
  balanced: {
    id: "balanced",
    title: "Balanced",
    rules: {
      // Keep legacy v2 allocation behavior as default.
      emergencyFirst: false,
      minEmergencyMonths: 3,
      debtExtraPaymentPctOfSurplus: 1,
      investMinPctOfSurplus: 0,
      lumpSumReservePctOfSurplus: 0,
    },
    guards: {
      neverGoNegativeCash: true,
      stopInvestWhenEmergencyShort: false,
    },
  },
  safety: {
    id: "safety",
    title: "Safety-first",
    rules: {
      emergencyFirst: true,
      minEmergencyMonths: 6,
      debtExtraPaymentPctOfSurplus: 0.8,
      investMinPctOfSurplus: 0,
      lumpSumReservePctOfSurplus: 0.2,
    },
    guards: {
      neverGoNegativeCash: true,
      stopInvestWhenEmergencyShort: true,
    },
  },
  growth: {
    id: "growth",
    title: "Growth-first",
    rules: {
      emergencyFirst: false,
      minEmergencyMonths: 3,
      debtExtraPaymentPctOfSurplus: 0.2,
      investMinPctOfSurplus: 0.6,
      lumpSumReservePctOfSurplus: 0.2,
    },
    guards: {
      neverGoNegativeCash: true,
      stopInvestWhenEmergencyShort: true,
    },
  },
};

const POLICY_ID_SET = new Set<AllocationPolicyId>(Object.keys(POLICY_PRESETS) as AllocationPolicyId[]);

export function isAllocationPolicyId(value: unknown): value is AllocationPolicyId {
  return typeof value === "string" && POLICY_ID_SET.has(value as AllocationPolicyId);
}

export function resolveAllocationPolicyId(value: unknown): AllocationPolicyId {
  return isAllocationPolicyId(value) ? value : "balanced";
}

export function getAllocationPolicy(policyId?: AllocationPolicyId): AllocationPolicy {
  return POLICY_PRESETS[policyId ?? "balanced"] ?? POLICY_PRESETS.balanced;
}
