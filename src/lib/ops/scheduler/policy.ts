import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { resolveOpsDataDir } from "@/lib/planning/storage/dataDir";

const POLICY_VERSION = 1;
const MIN_CONSECUTIVE = 1;
const MAX_CONSECUTIVE = 100;

export type OpsSchedulerThresholdPolicy = {
  version: number;
  warnConsecutiveFailures: number;
  riskConsecutiveFailures: number;
  updatedAt: string;
};

export type SchedulerThresholdPolicyValidationResult =
  | {
      ok: true;
      data: OpsSchedulerThresholdPolicy;
    }
  | {
      ok: false;
      errors: string[];
    };

export type OpsSchedulerThresholdPolicyInspection = {
  policy: OpsSchedulerThresholdPolicy;
  source: "file" | "default";
  valid: boolean;
  exists: boolean;
  errors: string[];
  path: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toIso(value: unknown): string {
  const raw = asString(value);
  const parsed = Date.parse(raw);
  if (!raw || !Number.isFinite(parsed)) return new Date().toISOString();
  return new Date(parsed).toISOString();
}

function toOptionalInt(value: unknown): number | null {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function resolveDefaultWarn(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = toOptionalInt(env.PLANNING_OPS_SCHEDULER_WARN_CONSECUTIVE);
  if (parsed === null) return 1;
  return clampInt(parsed, MIN_CONSECUTIVE, MAX_CONSECUTIVE);
}

function resolveDefaultRisk(
  warnConsecutiveFailures: number,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const parsed = toOptionalInt(env.PLANNING_OPS_SCHEDULER_RISK_CONSECUTIVE);
  if (parsed === null) return Math.max(3, warnConsecutiveFailures);
  return clampInt(parsed, warnConsecutiveFailures, MAX_CONSECUTIVE);
}

export function resolveOpsSchedulerThresholdPolicyPath(): string {
  const override = asString(process.env.PLANNING_OPS_SCHEDULER_POLICY_PATH);
  if (override) return path.resolve(process.cwd(), override);
  return path.join(resolveOpsDataDir(), "scheduler-policy.json");
}

export function buildDefaultOpsSchedulerThresholdPolicy(
  env: NodeJS.ProcessEnv = process.env,
): OpsSchedulerThresholdPolicy {
  const warnConsecutiveFailures = resolveDefaultWarn(env);
  const riskConsecutiveFailures = resolveDefaultRisk(warnConsecutiveFailures, env);
  return {
    version: POLICY_VERSION,
    warnConsecutiveFailures,
    riskConsecutiveFailures,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeLoadedPolicy(raw: unknown, fallback: OpsSchedulerThresholdPolicy): OpsSchedulerThresholdPolicy {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;
  const row = raw as Record<string, unknown>;
  const warnRaw = toOptionalInt(row.warnConsecutiveFailures);
  const warnConsecutiveFailures = warnRaw === null
    ? fallback.warnConsecutiveFailures
    : clampInt(warnRaw, MIN_CONSECUTIVE, MAX_CONSECUTIVE);
  const riskRaw = toOptionalInt(row.riskConsecutiveFailures);
  const riskConsecutiveFailures = riskRaw === null
    ? fallback.riskConsecutiveFailures
    : clampInt(riskRaw, warnConsecutiveFailures, MAX_CONSECUTIVE);
  const versionRaw = toOptionalInt(row.version);
  return {
    version: versionRaw === null ? POLICY_VERSION : Math.max(POLICY_VERSION, versionRaw),
    warnConsecutiveFailures,
    riskConsecutiveFailures,
    updatedAt: toIso(row.updatedAt),
  };
}

export function loadOpsSchedulerThresholdPolicySync(
  env: NodeJS.ProcessEnv = process.env,
): OpsSchedulerThresholdPolicy {
  return inspectOpsSchedulerThresholdPolicySync(env).policy;
}

export async function loadOpsSchedulerThresholdPolicy(
  env: NodeJS.ProcessEnv = process.env,
): Promise<OpsSchedulerThresholdPolicy> {
  return (await inspectOpsSchedulerThresholdPolicy(env)).policy;
}

function validateLoadedPolicyRaw(
  raw: unknown,
  fallback: OpsSchedulerThresholdPolicy,
): SchedulerThresholdPolicyValidationResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      errors: ["policy file content must be a JSON object"],
    };
  }
  const row = raw as Record<string, unknown>;
  return validateOpsSchedulerThresholdPolicy({
    warnConsecutiveFailures: row.warnConsecutiveFailures,
    riskConsecutiveFailures: row.riskConsecutiveFailures,
  }, fallback);
}

export function inspectOpsSchedulerThresholdPolicySync(
  env: NodeJS.ProcessEnv = process.env,
): OpsSchedulerThresholdPolicyInspection {
  const fallback = buildDefaultOpsSchedulerThresholdPolicy(env);
  const filePath = resolveOpsSchedulerThresholdPolicyPath();
  let raw = "";
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") {
      return {
        policy: fallback,
        source: "default",
        valid: true,
        exists: false,
        errors: [],
        path: filePath,
      };
    }
    return {
      policy: fallback,
      source: "default",
      valid: false,
      exists: true,
      errors: [error instanceof Error ? error.message : "failed to read scheduler policy file"],
      path: filePath,
    };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      policy: fallback,
      source: "default",
      valid: false,
      exists: true,
      errors: ["policy file is empty"],
      path: filePath,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return {
      policy: fallback,
      source: "default",
      valid: false,
      exists: true,
      errors: ["policy file contains invalid JSON"],
      path: filePath,
    };
  }

  const validated = validateLoadedPolicyRaw(parsed, fallback);
  if (!validated.ok) {
    return {
      policy: fallback,
      source: "default",
      valid: false,
      exists: true,
      errors: validated.errors,
      path: filePath,
    };
  }

  return {
    policy: normalizeLoadedPolicy(parsed, validated.data),
    source: "file",
    valid: true,
    exists: true,
    errors: [],
    path: filePath,
  };
}

export async function inspectOpsSchedulerThresholdPolicy(
  env: NodeJS.ProcessEnv = process.env,
): Promise<OpsSchedulerThresholdPolicyInspection> {
  const fallback = buildDefaultOpsSchedulerThresholdPolicy(env);
  const filePath = resolveOpsSchedulerThresholdPolicyPath();
  let raw = "";
  try {
    raw = await fsPromises.readFile(filePath, "utf-8");
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") {
      return {
        policy: fallback,
        source: "default",
        valid: true,
        exists: false,
        errors: [],
        path: filePath,
      };
    }
    return {
      policy: fallback,
      source: "default",
      valid: false,
      exists: true,
      errors: [error instanceof Error ? error.message : "failed to read scheduler policy file"],
      path: filePath,
    };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      policy: fallback,
      source: "default",
      valid: false,
      exists: true,
      errors: ["policy file is empty"],
      path: filePath,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return {
      policy: fallback,
      source: "default",
      valid: false,
      exists: true,
      errors: ["policy file contains invalid JSON"],
      path: filePath,
    };
  }

  const validated = validateLoadedPolicyRaw(parsed, fallback);
  if (!validated.ok) {
    return {
      policy: fallback,
      source: "default",
      valid: false,
      exists: true,
      errors: validated.errors,
      path: filePath,
    };
  }

  return {
    policy: normalizeLoadedPolicy(parsed, validated.data),
    source: "file",
    valid: true,
    exists: true,
    errors: [],
    path: filePath,
  };
}

export function validateOpsSchedulerThresholdPolicy(
  input: unknown,
  current: OpsSchedulerThresholdPolicy = buildDefaultOpsSchedulerThresholdPolicy(),
): SchedulerThresholdPolicyValidationResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      errors: ["policy body must be an object"],
    };
  }
  const row = input as Record<string, unknown>;
  const errors: string[] = [];
  const warnRaw = toOptionalInt(row.warnConsecutiveFailures);
  const riskRaw = toOptionalInt(row.riskConsecutiveFailures);
  if (warnRaw === null) {
    errors.push("warnConsecutiveFailures must be an integer");
  }
  if (riskRaw === null) {
    errors.push("riskConsecutiveFailures must be an integer");
  }
  const warnConsecutiveFailures = warnRaw === null
    ? current.warnConsecutiveFailures
    : warnRaw;
  const riskConsecutiveFailures = riskRaw === null
    ? current.riskConsecutiveFailures
    : riskRaw;
  if (warnConsecutiveFailures < MIN_CONSECUTIVE || warnConsecutiveFailures > MAX_CONSECUTIVE) {
    errors.push(`warnConsecutiveFailures must be between ${MIN_CONSECUTIVE} and ${MAX_CONSECUTIVE}`);
  }
  if (riskConsecutiveFailures < MIN_CONSECUTIVE || riskConsecutiveFailures > MAX_CONSECUTIVE) {
    errors.push(`riskConsecutiveFailures must be between ${MIN_CONSECUTIVE} and ${MAX_CONSECUTIVE}`);
  }
  if (riskConsecutiveFailures < warnConsecutiveFailures) {
    errors.push("riskConsecutiveFailures must be greater than or equal to warnConsecutiveFailures");
  }
  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    };
  }
  return {
    ok: true,
    data: {
      version: POLICY_VERSION,
      warnConsecutiveFailures: warnConsecutiveFailures,
      riskConsecutiveFailures: riskConsecutiveFailures,
      updatedAt: new Date().toISOString(),
    },
  };
}

export async function saveOpsSchedulerThresholdPolicy(
  policy: OpsSchedulerThresholdPolicy,
): Promise<OpsSchedulerThresholdPolicy> {
  const filePath = resolveOpsSchedulerThresholdPolicyPath();
  const normalized: OpsSchedulerThresholdPolicy = {
    version: POLICY_VERSION,
    warnConsecutiveFailures: clampInt(policy.warnConsecutiveFailures, MIN_CONSECUTIVE, MAX_CONSECUTIVE),
    riskConsecutiveFailures: clampInt(policy.riskConsecutiveFailures, policy.warnConsecutiveFailures, MAX_CONSECUTIVE),
    updatedAt: toIso(policy.updatedAt),
  };
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fsPromises.writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
  await fsPromises.rename(tempPath, filePath);
  return normalized;
}

export async function deleteOpsSchedulerThresholdPolicy(): Promise<void> {
  const filePath = resolveOpsSchedulerThresholdPolicyPath();
  await fsPromises.rm(filePath, { force: true });
}
