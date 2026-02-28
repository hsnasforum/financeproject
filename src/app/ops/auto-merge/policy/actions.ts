"use server";

import { cookies, headers } from "next/headers";
import { append as appendAuditLog } from "@/lib/audit/auditLogStore";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertNotProduction,
  assertSameOrigin,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import {
  defaultAutoMergePolicy,
  loadAutoMergePolicy,
  saveAutoMergePolicy,
  validateAutoMergePolicy,
  type AutoMergePolicy,
} from "@/lib/ops/autoMergePolicy";

type PolicyUpdateInput = {
  csrf?: string;
  policy?: unknown;
  updatedBy?: string;
};

type PolicyActionResult = {
  ok: boolean;
  data?: AutoMergePolicy;
  effective?: {
    envEnabledFlag: boolean;
    policyEnabled: boolean;
    enabled: boolean;
  };
  error?: {
    code: string;
    message: string;
  };
  errors?: string[];
};

type PolicySummary = {
  enabled: boolean;
  mergeMethod: AutoMergePolicy["mergeMethod"];
  requiredLabel: string;
  requiredChecks: string[];
  minApprovals: number;
  requireClean: boolean;
  armDefaultPollSeconds: number;
  armMaxConcurrentPolls: number;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseEnvEnabledFlag(): boolean {
  return asString(process.env.AUTO_MERGE_ENABLED).toLowerCase() === "true";
}

function effectiveEnabled(envEnabledFlag: boolean, policyEnabled: boolean): boolean {
  return envEnabledFlag && policyEnabled;
}

function toPolicySummary(policy: AutoMergePolicy): PolicySummary {
  return {
    enabled: policy.enabled,
    mergeMethod: policy.mergeMethod,
    requiredLabel: policy.requiredLabel,
    requiredChecks: [...policy.requiredChecks],
    minApprovals: policy.minApprovals,
    requireClean: policy.requireClean,
    armDefaultPollSeconds: policy.arm.defaultPollSeconds,
    armMaxConcurrentPolls: policy.arm.maxConcurrentPolls,
  };
}

function summarizePolicyDiff(before: AutoMergePolicy, after: AutoMergePolicy): string {
  const changes: string[] = [];
  if (before.enabled !== after.enabled) changes.push(`enabled:${before.enabled}->${after.enabled}`);
  if (before.mergeMethod !== after.mergeMethod) changes.push(`mergeMethod:${before.mergeMethod}->${after.mergeMethod}`);
  if (before.requiredLabel !== after.requiredLabel) changes.push(`requiredLabel:${before.requiredLabel}->${after.requiredLabel}`);
  if (before.minApprovals !== after.minApprovals) changes.push(`minApprovals:${before.minApprovals}->${after.minApprovals}`);
  if (before.requireClean !== after.requireClean) changes.push(`requireClean:${before.requireClean}->${after.requireClean}`);
  if (before.arm.defaultPollSeconds !== after.arm.defaultPollSeconds) {
    changes.push(`arm.defaultPollSeconds:${before.arm.defaultPollSeconds}->${after.arm.defaultPollSeconds}`);
  }
  if (before.arm.maxConcurrentPolls !== after.arm.maxConcurrentPolls) {
    changes.push(`arm.maxConcurrentPolls:${before.arm.maxConcurrentPolls}->${after.arm.maxConcurrentPolls}`);
  }
  const beforeChecks = before.requiredChecks.map((item) => item.toLowerCase()).join(",");
  const afterChecks = after.requiredChecks.map((item) => item.toLowerCase()).join(",");
  if (beforeChecks !== afterChecks) {
    changes.push(`requiredChecks:${before.requiredChecks.join("|")}->${after.requiredChecks.join("|")}`);
  }
  if (changes.length < 1) return "auto-merge policy saved (no changes)";
  return `auto-merge policy updated: ${changes.join(", ")}`;
}

async function buildGuardRequest(): Promise<Request> {
  const headerStore = await headers();
  const cookieStore = await cookies();
  const requestHeaders = new Headers();

  headerStore.forEach((value, key) => {
    requestHeaders.set(key, value);
  });

  if (!requestHeaders.get("cookie")) {
    const cookieHeader = cookieStore
      .getAll()
      .map((entry) => `${entry.name}=${encodeURIComponent(entry.value)}`)
      .join("; ");
    if (cookieHeader) requestHeaders.set("cookie", cookieHeader);
  }

  const host = requestHeaders.get("x-forwarded-host")
    ?? requestHeaders.get("host")
    ?? "localhost:3000";
  const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
  const baseUrl = `${proto}://${host}`;

  return new Request(`${baseUrl}/ops/auto-merge/policy`, {
    method: "POST",
    headers: requestHeaders,
  });
}

function readCookieValue(rows: Array<{ name: string; value: string }>, name: string): string {
  const key = asString(name);
  if (!key) return "";
  const match = rows.find((entry) => asString(entry?.name) === key);
  return asString(match?.value);
}

function writePolicyAudit(input: {
  summary: string;
  result: "SUCCESS" | "REJECTED" | "ERROR";
  reasonCode?: string;
  before?: AutoMergePolicy;
  after?: AutoMergePolicy;
  errors?: string[];
  message?: string;
}): void {
  try {
    appendAuditLog({
      event: "AUTO_MERGE_POLICY_UPDATE",
      route: "/ops/auto-merge/policy",
      summary: input.summary,
      details: {
        result: input.result,
        ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
        ...(input.message ? { message: input.message } : {}),
        ...(Array.isArray(input.errors) && input.errors.length > 0 ? { errors: input.errors.slice(0, 5) } : {}),
        ...(input.before ? { before: toPolicySummary(input.before) } : {}),
        ...(input.after ? { after: toPolicySummary(input.after) } : {}),
      },
    });
  } catch (error) {
    console.error("[audit] failed to append auto merge policy update log", error);
  }
}

export async function saveAutoMergePolicyAction(input: PolicyUpdateInput): Promise<PolicyActionResult> {
  try {
    assertNotProduction();
    const guardRequest = await buildGuardRequest();
    const cookieStore = await cookies();
    const csrf = asString(input?.csrf) || readCookieValue(cookieStore.getAll(), "dev_csrf");
    assertLocalHost(guardRequest);
    assertSameOrigin(guardRequest);
    assertDevUnlocked(guardRequest);
    assertCsrf(guardRequest, { csrf });
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    const message = guard?.message ?? "요청 검증에 실패했습니다.";
    writePolicyAudit({
      summary: `auto-merge policy rejected: ${message}`,
      result: "REJECTED",
      reasonCode: guard?.code ?? "GUARD_FAILED",
      message,
    });
    return {
      ok: false,
      error: {
        code: guard?.code ?? "GUARD_FAILED",
        message,
      },
    };
  }

  const before = await loadAutoMergePolicy();
  const candidate = input && typeof input.policy === "object" && input.policy !== null
    ? input.policy
    : {};
  const validated = validateAutoMergePolicy(candidate);
  if (!validated.ok) {
    const message = validated.errors[0] ?? "정책 값이 올바르지 않습니다.";
    writePolicyAudit({
      summary: `auto-merge policy rejected: ${message}`,
      result: "REJECTED",
      reasonCode: "VALIDATION_FAIL",
      before,
      errors: validated.errors,
      message,
    });
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAIL",
        message,
      },
      errors: validated.errors,
    };
  }

  try {
    const saved = await saveAutoMergePolicy({
      ...validated.policy,
      updatedBy: asString(input?.updatedBy) || "local",
    });
    const envEnabledFlag = parseEnvEnabledFlag();
    writePolicyAudit({
      summary: summarizePolicyDiff(before, saved),
      result: "SUCCESS",
      reasonCode: "SUCCESS",
      before,
      after: saved,
    });
    return {
      ok: true,
      data: saved,
      effective: {
        envEnabledFlag,
        policyEnabled: saved.enabled,
        enabled: effectiveEnabled(envEnabledFlag, saved.enabled),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "정책 저장에 실패했습니다.";
    writePolicyAudit({
      summary: `auto-merge policy error: ${message}`,
      result: "ERROR",
      reasonCode: "SAVE_FAILED",
      before,
      message,
    });
    return {
      ok: false,
      error: {
        code: "SAVE_FAILED",
        message,
      },
    };
  }
}

export async function resetAutoMergePolicyAction(input: { csrf?: string; updatedBy?: string } = {}): Promise<PolicyActionResult> {
  const defaults = defaultAutoMergePolicy();
  return saveAutoMergePolicyAction({
    csrf: input.csrf,
    updatedBy: asString(input.updatedBy) || "local",
    policy: defaults,
  });
}
