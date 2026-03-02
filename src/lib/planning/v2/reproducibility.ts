import { stableStringify, sha256Hex } from "../cache/key";
import { type PlanningRunRecord } from "../store/types";
import { DEFAULT_PLANNING_POLICY, type PlanningInterpretationPolicy } from "./insights/planningPolicy";
import { normalizeAssumptionsOverrides, type AssumptionsOverrideEntry } from "../assumptions/overrides";

const APP_VERSION = process.env.APP_VERSION?.trim()
  || process.env.NEXT_PUBLIC_APP_VERSION?.trim()
  || process.env.npm_package_version?.trim()
  || "unknown";

const ENGINE_VERSION = process.env.PLANNING_ENGINE_VERSION?.trim() || "planning-v2";

export type BuildRunReproducibilityInput = {
  profile: unknown;
  assumptionsSnapshotId?: string;
  assumptionsSnapshot?: unknown;
  effectiveAssumptions?: unknown;
  appliedOverrides?: AssumptionsOverrideEntry[];
  policy?: PlanningInterpretationPolicy;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function clonePlanningPolicy(policy: PlanningInterpretationPolicy = DEFAULT_PLANNING_POLICY): PlanningInterpretationPolicy {
  return JSON.parse(JSON.stringify(policy)) as PlanningInterpretationPolicy;
}

export function computeProfileHash(profile: unknown): string {
  return sha256Hex(stableStringify(profile ?? null));
}

export function computeAssumptionsHash(snapshot: unknown): string | undefined {
  if (snapshot === undefined || snapshot === null) return undefined;
  return sha256Hex(stableStringify(snapshot));
}

export function buildRunReproducibilityMeta(
  input: BuildRunReproducibilityInput,
): NonNullable<PlanningRunRecord["reproducibility"]> {
  const snapshotId = asString(input.assumptionsSnapshotId);
  const assumptionsHash = computeAssumptionsHash(input.assumptionsSnapshot);
  const effectiveAssumptionsHash = computeAssumptionsHash(input.effectiveAssumptions);
  const appliedOverrides = normalizeAssumptionsOverrides(input.appliedOverrides ?? []);

  return {
    appVersion: APP_VERSION,
    engineVersion: ENGINE_VERSION,
    profileHash: computeProfileHash(input.profile),
    ...(snapshotId ? { assumptionsSnapshotId: snapshotId } : {}),
    ...(assumptionsHash ? { assumptionsHash } : {}),
    ...(effectiveAssumptionsHash ? { effectiveAssumptionsHash } : {}),
    ...(appliedOverrides.length > 0 ? { appliedOverrides } : {}),
    policy: clonePlanningPolicy(input.policy),
  };
}
