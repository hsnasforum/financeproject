"use server";

import { cookies, headers } from "next/headers";
import { append as appendAuditLog } from "../../../lib/audit/auditLogStore";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertNotProduction,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../lib/dev/devGuards";
import {
  applyPlanningCleanup,
  planPlanningCleanup,
  type CleanupPlan,
  type CleanupTarget,
} from "../../../lib/planning/retention/cleanup";
import { loadPlanningRetentionPolicy } from "../../../lib/planning/retention/policy";
import { buildConfirmString, verifyConfirm } from "../../../lib/ops/confirm";

type CleanupActionInput = {
  target?: unknown;
  csrf?: unknown;
  confirmText?: unknown;
};

type CleanupActionResult = {
  ok: boolean;
  message: string;
  data?: {
    target: CleanupTarget;
    nowIso: string;
    policy: ReturnType<typeof loadPlanningRetentionPolicy>;
    summary: CleanupPlan["summary"];
    sample: Array<{ path: string; reason: string; sizeBytes?: number }>;
    expectedConfirm?: string;
    applied?: {
      deleted: number;
      bytes?: number;
      failedCount: number;
    };
  };
  error?: {
    code: string;
    message: string;
  };
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseTarget(value: unknown): CleanupTarget {
  const raw = asString(value);
  if (raw === "runs" || raw === "cache" || raw === "opsReports" || raw === "assumptionsHistory" || raw === "trash" || raw === "all") {
    return raw;
  }
  return "all";
}

function expectedConfirmText(target: CleanupTarget, deleteCount: number): string {
  return buildConfirmString(`CLEANUP ${target}`, String(deleteCount));
}

function sampleActions(plan: CleanupPlan): CleanupActionResult["data"]["sample"] {
  return plan.actions.slice(0, 10).map((row) => ({
    path: row.path,
    reason: row.reason,
    ...(typeof row.sizeBytes === "number" ? { sizeBytes: row.sizeBytes } : {}),
  }));
}

async function buildGuardRequest(): Promise<Request> {
  const headerStore = await headers();
  const cookieStore = await cookies();
  const requestHeaders = new Headers();

  headerStore.forEach((value, key) => requestHeaders.set(key, value));
  if (!requestHeaders.get("cookie")) {
    const cookieHeader = cookieStore
      .getAll()
      .map((row) => `${row.name}=${encodeURIComponent(row.value)}`)
      .join("; ");
    if (cookieHeader) requestHeaders.set("cookie", cookieHeader);
  }

  const host = requestHeaders.get("x-forwarded-host")
    ?? requestHeaders.get("host")
    ?? "localhost:3000";
  const proto = requestHeaders.get("x-forwarded-proto") ?? "http";

  return new Request(`${proto}://${host}/ops/planning-cleanup`, {
    method: "POST",
    headers: requestHeaders,
  });
}

function readCookieValue(rows: Array<{ name: string; value: string }>, name: string): string {
  const needle = asString(name);
  if (!needle) return "";
  const match = rows.find((row) => asString(row.name) === needle);
  return asString(match?.value);
}

function appendCleanupAudit(input: {
  event: "PLANNING_CLEANUP_DRYRUN" | "PLANNING_CLEANUP_APPLY";
  result: "SUCCESS" | "REJECTED" | "ERROR";
  target: CleanupTarget;
  deleteCount?: number;
  bytes?: number;
  message: string;
}): void {
  try {
    appendAuditLog({
      event: input.event,
      route: "/ops/planning-cleanup",
      summary: `${input.event} ${input.result}: ${input.message}`,
      details: {
        result: input.result,
        target: input.target,
        deleteCount: input.deleteCount ?? null,
        bytes: input.bytes ?? null,
        message: input.message,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append planning cleanup log", error);
  }
}

async function assertGuard(input: CleanupActionInput): Promise<CleanupActionResult | null> {
  try {
    assertNotProduction();
    const guardRequest = await buildGuardRequest();
    const cookieStore = await cookies();
    const csrf = asString(input.csrf) || readCookieValue(cookieStore.getAll(), "dev_csrf");
    assertLocalHost(guardRequest);
    assertSameOrigin(guardRequest);
    assertDevUnlocked(guardRequest);
    assertCsrf(guardRequest, { csrf });
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    const message = guard?.message ?? "요청 검증에 실패했습니다.";
    return {
      ok: false,
      message,
      error: {
        code: guard?.code ?? "GUARD_FAILED",
        message,
      },
    };
  }
}

export async function dryRunCleanupAction(input: CleanupActionInput = {}): Promise<CleanupActionResult> {
  const target = parseTarget(input.target);

  const guard = await assertGuard(input);
  if (guard) {
    appendCleanupAudit({
      event: "PLANNING_CLEANUP_DRYRUN",
      result: "REJECTED",
      target,
      message: guard.message,
    });
    return guard;
  }

  try {
    const policy = loadPlanningRetentionPolicy();
    const plan = await planPlanningCleanup({ target, policy });
    const message = `삭제 예정 ${plan.summary.deleteCount}건을 계산했습니다.`;
    appendCleanupAudit({
      event: "PLANNING_CLEANUP_DRYRUN",
      result: "SUCCESS",
      target: plan.target,
      deleteCount: plan.summary.deleteCount,
      bytes: plan.summary.totalBytes,
      message,
    });
    return {
      ok: true,
      message,
      data: {
        target: plan.target,
        nowIso: plan.nowIso,
        policy: plan.policy,
        summary: plan.summary,
        sample: sampleActions(plan),
        expectedConfirm: expectedConfirmText(plan.target, plan.summary.deleteCount),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "cleanup dry-run에 실패했습니다.";
    appendCleanupAudit({
      event: "PLANNING_CLEANUP_DRYRUN",
      result: "ERROR",
      target,
      message,
    });
    return {
      ok: false,
      message,
      error: {
        code: "INTERNAL",
        message,
      },
    };
  }
}

export async function applyCleanupAction(input: CleanupActionInput = {}): Promise<CleanupActionResult> {
  const target = parseTarget(input.target);

  const guard = await assertGuard(input);
  if (guard) {
    appendCleanupAudit({
      event: "PLANNING_CLEANUP_APPLY",
      result: "REJECTED",
      target,
      message: guard.message,
    });
    return guard;
  }

  try {
    const policy = loadPlanningRetentionPolicy();
    const plan = await planPlanningCleanup({ target, policy });
    const expected = expectedConfirmText(plan.target, plan.summary.deleteCount);
    const confirmText = asString(input.confirmText);

    if (!verifyConfirm(confirmText, expected)) {
      const message = `확인 문구가 일치하지 않습니다. (${expected})`;
      appendCleanupAudit({
        event: "PLANNING_CLEANUP_APPLY",
        result: "REJECTED",
        target: plan.target,
        deleteCount: plan.summary.deleteCount,
        message,
      });
      return {
        ok: false,
        message,
        error: {
          code: "CONFIRM_MISMATCH",
          message,
        },
        data: {
          target: plan.target,
          nowIso: plan.nowIso,
          policy: plan.policy,
          summary: plan.summary,
          sample: sampleActions(plan),
          expectedConfirm: expected,
        },
      };
    }

    const applied = await applyPlanningCleanup(plan);
    const failedCount = applied.failed?.length ?? 0;
    const message = failedCount > 0
      ? `정리 ${applied.deleted}건 완료, 실패 ${failedCount}건`
      : `정리 ${applied.deleted}건 완료`;

    appendCleanupAudit({
      event: "PLANNING_CLEANUP_APPLY",
      result: "SUCCESS",
      target: plan.target,
      deleteCount: applied.deleted,
      bytes: applied.bytes,
      message,
    });

    return {
      ok: true,
      message,
      data: {
        target: plan.target,
        nowIso: plan.nowIso,
        policy: plan.policy,
        summary: plan.summary,
        sample: sampleActions(plan),
        applied: {
          deleted: applied.deleted,
          ...(typeof applied.bytes === "number" ? { bytes: applied.bytes } : {}),
          failedCount,
        },
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "cleanup 적용에 실패했습니다.";
    appendCleanupAudit({
      event: "PLANNING_CLEANUP_APPLY",
      result: "ERROR",
      target,
      message,
    });
    return {
      ok: false,
      message,
      error: {
        code: "INTERNAL",
        message,
      },
    };
  }
}
