import fs from "node:fs/promises";
import path from "node:path";
import type { GithubEnv } from "../github/env";
import { resolveOpsDataDir } from "../planning/storage/dataDir";

export type AutoMergePolicy = {
  version: 1;
  enabled: boolean;
  mergeMethod: "squash" | "merge" | "rebase";
  requiredLabel: string;
  requiredChecks: string[];
  minApprovals: number;
  requireClean: boolean;
  arm: {
    defaultPollSeconds: number;
    maxConcurrentPolls: number;
  };
  updatedAt: string;
  updatedBy: string;
};

export type EffectiveAutoMergePolicy = {
  enabled: boolean;
  envEnabledFlag: boolean;
  policyEnabled: boolean;
  mergeMethod: AutoMergePolicy["mergeMethod"];
  requiredLabel: string;
  requiredChecks: string[];
  minApprovals: number;
  requireClean: boolean;
  arm: AutoMergePolicy["arm"];
  confirmTemplate: string;
  updatedAt: string;
  updatedBy: string;
};

export type ValidateAutoMergePolicyResult = {
  ok: boolean;
  policy: AutoMergePolicy;
  errors: string[];
};

const POLICY_VERSION = 1 as const;
const POLICY_TMP_SUFFIX = ".tmp";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function asInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

function normalizeRequiredChecks(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const dedup = new Set<string>();
  for (const raw of value) {
    const name = asString(raw);
    const key = name.toLowerCase();
    if (!key || dedup.has(key)) continue;
    dedup.add(key);
    out.push(name);
  }
  return out;
}

export function defaultAutoMergePolicy(now = new Date()): AutoMergePolicy {
  return {
    version: POLICY_VERSION,
    enabled: false,
    mergeMethod: "squash",
    requiredLabel: "automerge",
    requiredChecks: ["CI"],
    minApprovals: 0,
    requireClean: false,
    arm: {
      defaultPollSeconds: 15,
      maxConcurrentPolls: 3,
    },
    updatedAt: now.toISOString(),
    updatedBy: "local",
  };
}

export function resolveAutoMergePolicyPath(customPath?: string): string {
  const envPath = asString(process.env.AUTO_MERGE_POLICY_PATH);
  const fromInput = asString(customPath);
  const target = fromInput || envPath;
  if (target) return path.resolve(process.cwd(), target);
  return path.join(resolveOpsDataDir(), "auto-merge-policy.json");
}

export function validateAutoMergePolicy(input: unknown): ValidateAutoMergePolicyResult {
  const base = defaultAutoMergePolicy();
  const row = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};

  const policy: AutoMergePolicy = {
    version: POLICY_VERSION,
    enabled: asBoolean(row.enabled, base.enabled),
    mergeMethod: asString(row.mergeMethod) as AutoMergePolicy["mergeMethod"],
    requiredLabel: asString(row.requiredLabel),
    requiredChecks: normalizeRequiredChecks(row.requiredChecks),
    minApprovals: asInt(row.minApprovals, base.minApprovals),
    requireClean: asBoolean(row.requireClean, base.requireClean),
    arm: {
      defaultPollSeconds: asInt((row.arm as Record<string, unknown> | undefined)?.defaultPollSeconds, base.arm.defaultPollSeconds),
      maxConcurrentPolls: asInt((row.arm as Record<string, unknown> | undefined)?.maxConcurrentPolls, base.arm.maxConcurrentPolls),
    },
    updatedAt: asString(row.updatedAt) || base.updatedAt,
    updatedBy: asString(row.updatedBy) || "local",
  };

  const errors: string[] = [];
  if (policy.mergeMethod !== "squash" && policy.mergeMethod !== "merge" && policy.mergeMethod !== "rebase") {
    errors.push("mergeMethod must be one of: squash|merge|rebase");
    policy.mergeMethod = base.mergeMethod;
  }
  if (!policy.requiredLabel) {
    errors.push("requiredLabel must not be empty");
    policy.requiredLabel = base.requiredLabel;
  }
  if (policy.requiredChecks.length < 1) {
    errors.push("requiredChecks must include at least one check name");
    policy.requiredChecks = [...base.requiredChecks];
  }
  if (!Number.isFinite(policy.minApprovals) || policy.minApprovals < 0) {
    errors.push("minApprovals must be >= 0");
    policy.minApprovals = base.minApprovals;
  }
  if (policy.arm.defaultPollSeconds < 5 || policy.arm.defaultPollSeconds > 120) {
    errors.push("arm.defaultPollSeconds must be within 5..120");
    policy.arm.defaultPollSeconds = base.arm.defaultPollSeconds;
  }
  if (policy.arm.maxConcurrentPolls < 1 || policy.arm.maxConcurrentPolls > 10) {
    errors.push("arm.maxConcurrentPolls must be within 1..10");
    policy.arm.maxConcurrentPolls = base.arm.maxConcurrentPolls;
  }

  return {
    ok: errors.length < 1,
    policy,
    errors,
  };
}

export async function loadAutoMergePolicy(customPath?: string): Promise<AutoMergePolicy> {
  const filePath = resolveAutoMergePolicyPath(customPath);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    const validated = validateAutoMergePolicy(parsed);
    if (!validated.ok) {
      console.warn("[auto-merge-policy] invalid policy file, using defaults", {
        path: filePath,
        errors: validated.errors.slice(0, 3),
      });
      return defaultAutoMergePolicy();
    }
    return validated.policy;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code !== "ENOENT") {
      console.warn("[auto-merge-policy] failed to read policy file, using defaults", {
        path: filePath,
      });
    }
    return defaultAutoMergePolicy();
  }
}

export async function saveAutoMergePolicy(next: AutoMergePolicy, customPath?: string): Promise<AutoMergePolicy> {
  const validated = validateAutoMergePolicy(next);
  if (!validated.ok) {
    throw new Error(validated.errors[0] ?? "invalid auto merge policy");
  }

  const filePath = resolveAutoMergePolicyPath(customPath);
  const saved: AutoMergePolicy = {
    ...validated.policy,
    updatedAt: new Date().toISOString(),
    updatedBy: asString(next.updatedBy) || "local",
  };

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}${POLICY_TMP_SUFFIX}`;
  await fs.writeFile(tmpPath, `${JSON.stringify(saved, null, 2)}\n`, "utf-8");
  await fs.rename(tmpPath, filePath);
  return saved;
}

export function buildEffectiveAutoMergePolicy(githubEnv: GithubEnv, policy: AutoMergePolicy): EffectiveAutoMergePolicy {
  const requiredChecks = policy.requiredChecks.length > 0 ? policy.requiredChecks : githubEnv.requiredChecks;
  return {
    enabled: githubEnv.enabledFlag && policy.enabled,
    envEnabledFlag: githubEnv.enabledFlag,
    policyEnabled: policy.enabled,
    mergeMethod: policy.mergeMethod,
    requiredLabel: policy.requiredLabel || githubEnv.requiredLabel,
    requiredChecks: requiredChecks.length > 0 ? requiredChecks : ["CI"],
    minApprovals: Number.isFinite(policy.minApprovals) ? Math.max(0, Math.trunc(policy.minApprovals)) : 0,
    requireClean: policy.requireClean,
    arm: {
      defaultPollSeconds: policy.arm.defaultPollSeconds,
      maxConcurrentPolls: policy.arm.maxConcurrentPolls,
    },
    confirmTemplate: githubEnv.confirmTemplate,
    updatedAt: policy.updatedAt,
    updatedBy: policy.updatedBy,
  };
}
