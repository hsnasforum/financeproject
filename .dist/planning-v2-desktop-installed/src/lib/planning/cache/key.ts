import crypto from "node:crypto";
import { type AssumptionsV2, type RiskTolerance } from "../v2/scenarios";
import { type PlanningCacheKind } from "./types";

type BuildCacheKeyArgs = {
  kind: PlanningCacheKind;
  profile?: unknown;
  profileId?: string;
  riskTolerance?: RiskTolerance;
  snapshotMeta?: { asOf?: string; fetchedAt?: string; missing?: boolean };
  horizonMonths: number;
  baseAssumptions: AssumptionsV2;
  overrides?: Partial<AssumptionsV2>;
  options?: unknown;
};

function normalizeObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => {
      const normalized = normalizeObject(item);
      return normalized === undefined ? null : normalized;
    });
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort((a, b) => a.localeCompare(b))) {
    const normalized = normalizeObject(record[key]);
    if (normalized === undefined) continue;
    output[key] = normalized;
  }
  return output;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeObject(value));
}

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function buildCacheKey(args: BuildCacheKeyArgs): {
  key: string;
  assumptionsHash: string;
  optionsHash: string;
} {
  const snapshot = {
    asOf: typeof args.snapshotMeta?.asOf === "string" ? args.snapshotMeta.asOf : undefined,
    missing: args.snapshotMeta?.missing === true,
  };

  const assumptionsPayload = {
    baseAssumptions: args.baseAssumptions,
    overrides: args.overrides ?? {},
  };

  const optionsPayload = {
    options: args.options ?? {},
    riskTolerance: args.riskTolerance ?? "mid",
  };

  const assumptionsHash = sha256Hex(stableStringify(assumptionsPayload));
  const optionsHash = sha256Hex(stableStringify(optionsPayload));
  const profileHash = sha256Hex(stableStringify(args.profile ?? null));

  const keyPayload = {
    kind: args.kind,
    profileId: typeof args.profileId === "string" ? args.profileId : undefined,
    profileHash,
    snapshot,
    horizonMonths: args.horizonMonths,
    assumptionsHash,
    optionsHash,
  };

  return {
    key: sha256Hex(stableStringify(keyPayload)),
    assumptionsHash,
    optionsHash,
  };
}
