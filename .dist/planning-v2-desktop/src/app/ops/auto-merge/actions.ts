"use server";

import fs from "node:fs/promises";
import path from "node:path";
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
import { getGithubClient } from "../../../lib/github/client";
import { requireGithubEnv } from "../../../lib/github/env";
import {
  evaluateMergeableState,
  fetchApprovalsCount,
  fetchPullWithMergeableRetry,
} from "../../../lib/github/autoMergePolicy";
import {
  buildEffectiveAutoMergePolicy,
  type EffectiveAutoMergePolicy,
  loadAutoMergePolicy,
} from "../../../lib/ops/autoMergePolicy";

type PullApiLabel = {
  name?: string;
} | null;

type PullApiResponse = {
  number?: number;
  state?: string;
  draft?: boolean;
  title?: string;
  html_url?: string;
  mergeable_state?: string | null;
  labels?: PullApiLabel[];
  head?: {
    sha?: string;
  } | null;
} | null;

type CheckRunItem = {
  name?: string;
  status?: string;
  conclusion?: string | null;
} | null;

type CheckRunsApiResponse = {
  check_runs?: CheckRunItem[];
} | null;

type StatusItem = {
  context?: string;
  state?: string;
} | null;

type CombinedStatusApiResponse = {
  statuses?: StatusItem[];
  contexts?: StatusItem[];
} | null;

type MergeApiResponse = {
  merged?: boolean;
  message?: string;
  sha?: string;
} | null;

type AuditResult = "SUCCESS" | "REJECTED" | "ERROR";

type RejectReason =
  | "DISABLED"
  | "LABEL_MISSING"
  | "APPROVALS_MISSING"
  | "MERGE_CONFLICT"
  | "BLOCKED"
  | "BEHIND"
  | "UNKNOWN_MERGEABLE"
  | "NOT_CLEAN"
  | "IN_PROGRESS"
  | "CHECKS_FAIL"
  | "CONFIRM_MISMATCH"
  | "SHA_MISMATCH"
  | "DRAFT"
  | "NOT_OPEN"
  | "MERGE_API_FAIL"
  | "MERGED"
  | "GUARD_FAILED"
  | "INVALID_INPUT"
  | "CONFIG"
  | "INTERNAL";

type ActionResult = {
  ok: boolean;
  merged: boolean;
  message: string;
  prUrl?: string;
  headSha?: string;
  requiredChecks?: string[];
  mergeCommitSha?: string;
};

type ActionAuditContext = {
  prNumber: number;
  requiredChecks: string[];
  confirmTemplate: string;
  enabledFlag: boolean;
  envEnabledFlag: boolean;
  policyEnabled: boolean;
  requiredLabel: string;
  minApprovals: number;
  requireClean: boolean;
  mergeMethod: "squash" | "merge" | "rebase";
  prUrl?: string;
  headSha?: string;
  mergeableState?: string;
  approvalsCount?: number;
};

type LockAcquireResult =
  | {
      ok: true;
      lockPath: string;
      release: () => Promise<void>;
    }
  | {
      ok: false;
      lockPath: string;
    };

export type MergePullRequestActionInput = {
  prNumber: number;
  expectedHeadSha: string;
  confirmText: string;
};

const LOCK_DIR = path.join(process.cwd(), ".data", "locks");
const LOCK_TTL_MS = 10 * 60 * 1000;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePrNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.trunc(parsed);
}

function normalizeCheckKey(value: string): string {
  return asString(value).toLowerCase();
}

function buildExpectedConfirmText(prNumber: number, headSha: string, template: string): string {
  return template
    .replaceAll("{PR}", String(prNumber))
    .replaceAll("{SHA7}", headSha.slice(0, 7));
}

function parseCheckRunsFailures(requiredChecks: string[], payload: CheckRunsApiResponse): string[] {
  const rows = Array.isArray(payload?.check_runs) ? payload.check_runs : [];
  return requiredChecks.flatMap((requiredName) => {
    const key = normalizeCheckKey(requiredName);
    const matches = rows
      .filter((item) => item && typeof item === "object" && normalizeCheckKey(asString(item.name)) === key)
      .map((item) => ({
        status: normalizeCheckKey(asString(item?.status)),
        conclusion: normalizeCheckKey(asString(item?.conclusion)),
      }));

    if (matches.length < 1) return [`${requiredName}: missing`];
    if (matches.some((item) => item.status === "completed" && item.conclusion === "success")) return [];
    if (matches.some((item) => item.status !== "completed")) return [`${requiredName}: pending`];
    const failedConclusion = matches.find((item) => item.conclusion && item.conclusion !== "success")?.conclusion || "failed";
    return [`${requiredName}: ${failedConclusion}`];
  });
}

function parseStatusFailures(requiredChecks: string[], payload: CombinedStatusApiResponse): string[] {
  const statusesFromApi = Array.isArray(payload?.statuses) ? payload.statuses : [];
  const contextsFromApi = Array.isArray(payload?.contexts) ? payload.contexts : [];
  const statuses = [...statusesFromApi, ...contextsFromApi];

  return requiredChecks.flatMap((requiredName) => {
    const key = normalizeCheckKey(requiredName);
    const matches = statuses
      .filter((item) => item && typeof item === "object" && normalizeCheckKey(asString(item.context)) === key)
      .map((item) => normalizeCheckKey(asString(item?.state)));

    if (matches.length < 1) return [`${requiredName}: missing`];
    if (matches.some((state) => state === "success")) return [];
    if (matches.some((state) => state === "pending")) return [`${requiredName}: pending`];
    const failedState = matches.find((state) => state && state !== "success") || "failed";
    return [`${requiredName}: ${failedState}`];
  });
}

function normalizePullLabels(pull: PullApiResponse): string[] {
  const rows = Array.isArray(pull?.labels) ? pull.labels : [];
  return rows
    .map((item) => asString(item?.name))
    .filter((label) => label.length > 0);
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

  return new Request(`${baseUrl}/ops/auto-merge`, {
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

async function writeAudit(
  result: AuditResult,
  message: string,
  reason: RejectReason,
  details: Record<string, unknown>,
): Promise<void> {
  const resultKo = result === "SUCCESS" ? "성공" : result === "REJECTED" ? "거부" : "오류";
  try {
    appendAuditLog({
      event: "AUTO_MERGE",
      route: "/ops/auto-merge",
      summary: `AUTO_MERGE ${result} (${resultKo}): ${message}`,
      details: {
        ...details,
        reason,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append AUTO_MERGE", error);
  }
}

function rejectResult(
  message: string,
  input: {
    prUrl?: string;
    headSha?: string;
    requiredChecks?: string[];
  } = {},
): ActionResult {
  return {
    ok: false,
    merged: false,
    message,
    ...(input.prUrl ? { prUrl: input.prUrl } : {}),
    ...(input.headSha ? { headSha: input.headSha } : {}),
    ...(input.requiredChecks ? { requiredChecks: input.requiredChecks } : {}),
  };
}

function buildAuditContext(
  input: Partial<ActionAuditContext> & {
    prNumber: number;
  },
): ActionAuditContext {
  return {
    prNumber: input.prNumber,
    requiredChecks: input.requiredChecks ?? [],
    confirmTemplate: input.confirmTemplate ?? "MERGE {PR} {SHA7}",
    enabledFlag: input.enabledFlag ?? false,
    envEnabledFlag: input.envEnabledFlag ?? false,
    policyEnabled: input.policyEnabled ?? false,
    requiredLabel: input.requiredLabel ?? "automerge",
    minApprovals: input.minApprovals ?? 0,
    requireClean: input.requireClean ?? false,
    mergeMethod: input.mergeMethod ?? "squash",
    ...(input.prUrl ? { prUrl: input.prUrl } : {}),
    ...(input.headSha ? { headSha: input.headSha } : {}),
    ...(input.mergeableState ? { mergeableState: input.mergeableState } : {}),
    ...(typeof input.approvalsCount === "number" ? { approvalsCount: input.approvalsCount } : {}),
  };
}

async function createLockFile(lockPath: string, prNumber: number): Promise<void> {
  const handle = await fs.open(lockPath, "wx");
  try {
    await handle.writeFile(
      `${JSON.stringify({
        prNumber,
        createdAt: new Date().toISOString(),
        pid: process.pid,
      })}\n`,
      "utf-8",
    );
  } finally {
    await handle.close();
  }
}

async function tryAcquireLock(lockPath: string, prNumber: number): Promise<boolean> {
  try {
    await createLockFile(lockPath, prNumber);
    return true;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "EEXIST") return false;
    throw error;
  }
}

async function acquireAutoMergeLock(prNumber: number): Promise<LockAcquireResult> {
  const lockPath = path.join(LOCK_DIR, `auto-merge-pr-${prNumber}.lock`);
  await fs.mkdir(LOCK_DIR, { recursive: true });

  const acquired = await tryAcquireLock(lockPath, prNumber);
  if (acquired) {
    return {
      ok: true,
      lockPath,
      release: async () => {
        await fs.unlink(lockPath).catch(() => {});
      },
    };
  }

  const stat = await fs.stat(lockPath).catch(() => null);
  if (stat && Date.now() - stat.mtimeMs > LOCK_TTL_MS) {
    await fs.unlink(lockPath).catch(() => {});
    const reacquired = await tryAcquireLock(lockPath, prNumber);
    if (reacquired) {
      return {
        ok: true,
        lockPath,
        release: async () => {
          await fs.unlink(lockPath).catch(() => {});
        },
      };
    }
  }

  return {
    ok: false,
    lockPath,
  };
}

export async function mergePullRequestAction(input: MergePullRequestActionInput): Promise<ActionResult> {
  const prNumber = normalizePrNumber(input?.prNumber);
  const expectedHeadSha = asString(input?.expectedHeadSha);
  const confirmText = typeof input?.confirmText === "string" ? input.confirmText : "";
  let auditContext = buildAuditContext({ prNumber });

  try {
    assertNotProduction();
    const guardRequest = await buildGuardRequest();
    const cookieStore = await cookies();
    const csrf = readCookieValue(cookieStore.getAll(), "dev_csrf");
    assertLocalHost(guardRequest);
    assertSameOrigin(guardRequest);
    assertDevUnlocked(guardRequest);
    assertCsrf(guardRequest, { csrf });
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    const message = guard?.message ?? "요청 검증에 실패했습니다.";
    await writeAudit("REJECTED", message, "GUARD_FAILED", {
      ...auditContext,
      result: "REJECTED",
      code: guard?.code ?? "GUARD_FAILED",
    });
    return rejectResult(message);
  }

  if (!prNumber || !expectedHeadSha) {
    const message = "prNumber와 expectedHeadSha가 필요합니다.";
    await writeAudit("REJECTED", message, "INVALID_INPUT", {
      ...auditContext,
      expectedHeadSha,
      result: "REJECTED",
    });
    return rejectResult(message);
  }

  let effectivePolicy: EffectiveAutoMergePolicy | null = null;
  try {
    const githubEnv = requireGithubEnv();
    const policy = await loadAutoMergePolicy();
    effectivePolicy = buildEffectiveAutoMergePolicy(githubEnv, policy);
    auditContext = buildAuditContext({
      prNumber,
      requiredChecks: effectivePolicy.requiredChecks,
      confirmTemplate: effectivePolicy.confirmTemplate,
      enabledFlag: effectivePolicy.enabled,
      envEnabledFlag: effectivePolicy.envEnabledFlag,
      policyEnabled: effectivePolicy.policyEnabled,
      requiredLabel: effectivePolicy.requiredLabel,
      minApprovals: effectivePolicy.minApprovals,
      requireClean: effectivePolicy.requireClean,
      mergeMethod: effectivePolicy.mergeMethod,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub 환경변수 확인에 실패했습니다.";
    await writeAudit("ERROR", message, "CONFIG", {
      ...auditContext,
      result: "ERROR",
    });
    return rejectResult(message);
  }
  if (!effectivePolicy) {
    return rejectResult("Auto-merge policy를 불러오지 못했습니다.");
  }

  const requiredChecks = effectivePolicy.requiredChecks;
  const confirmTemplate = effectivePolicy.confirmTemplate;
  const enabledFlag = effectivePolicy.enabled;
  const requiredLabel = effectivePolicy.requiredLabel;
  const minApprovals = effectivePolicy.minApprovals;
  const requireClean = effectivePolicy.requireClean;
  const mergeMethod = effectivePolicy.mergeMethod;

  if (!enabledFlag) {
    const message = `AUTO_MERGE_DISABLED: env=${String(effectivePolicy.envEnabledFlag)}, policy.enabled=${String(effectivePolicy.policyEnabled)} (둘 다 true 필요)`;
    await writeAudit("REJECTED", message, "DISABLED", {
      ...auditContext,
      result: "REJECTED",
    });
    return rejectResult(message, { requiredChecks });
  }

  const lock = await acquireAutoMergeLock(prNumber);
  if (!lock.ok) {
    const message = "MERGE_IN_PROGRESS: 동일 PR 병합 작업이 이미 진행 중입니다.";
    await writeAudit("REJECTED", message, "IN_PROGRESS", {
      ...auditContext,
      result: "REJECTED",
      lockPath: lock.lockPath,
    });
    return rejectResult(message, { requiredChecks });
  }

  const github = getGithubClient();
  let prUrl = "";
  let headSha = "";

  try {
    const pull = await github.request<PullApiResponse>(`/pulls/${prNumber}`);
    const state = asString(pull?.state);
    const isDraft = pull?.draft === true;
    headSha = asString(pull?.head?.sha);
    prUrl = asString(pull?.html_url);
    let mergeableState = asString(pull?.mergeable_state).toLowerCase() || "unknown";
    const pullLabels = normalizePullLabels(pull);
    const labelSet = new Set(pullLabels.map((label) => normalizeCheckKey(label)));
    const requiredLabelKey = normalizeCheckKey(requiredLabel);
    auditContext = buildAuditContext({
      ...auditContext,
      prUrl,
      headSha,
      mergeableState,
    });

    if (state !== "open") {
      const message = `PR 상태가 open이 아닙니다. (state=${state || "-"})`;
      await writeAudit("REJECTED", message, "NOT_OPEN", {
        ...auditContext,
        result: "REJECTED",
      });
      return rejectResult(message, { prUrl, headSha, requiredChecks });
    }

    if (isDraft) {
      const message = "Draft PR은 병합할 수 없습니다.";
      await writeAudit("REJECTED", message, "DRAFT", {
        ...auditContext,
        result: "REJECTED",
      });
      return rejectResult(message, { prUrl, headSha, requiredChecks });
    }

    if (!labelSet.has(requiredLabelKey)) {
      const message = `필수 라벨 누락: ${requiredLabel}`;
      await writeAudit("REJECTED", message, "LABEL_MISSING", {
        ...auditContext,
        result: "REJECTED",
        labels: pullLabels,
      });
      return rejectResult(message, { prUrl, headSha, requiredChecks });
    }

    if (!headSha || headSha !== expectedHeadSha) {
      const message = "PR head SHA가 변경되었습니다. 새 상태를 다시 확인해 주세요.";
      await writeAudit("REJECTED", message, "SHA_MISMATCH", {
        ...auditContext,
        expectedHeadSha,
        result: "REJECTED",
      });
      return rejectResult(message, { prUrl, headSha, requiredChecks });
    }

    let checkFailures: string[] = [];
    try {
      const checkRuns = await github.request<CheckRunsApiResponse>(`/commits/${encodeURIComponent(headSha)}/check-runs?per_page=100`);
      checkFailures = parseCheckRunsFailures(requiredChecks, checkRuns);
    } catch {
      const statusPayload = await github.request<CombinedStatusApiResponse>(`/commits/${encodeURIComponent(headSha)}/status`);
      checkFailures = parseStatusFailures(requiredChecks, statusPayload);
    }

    if (checkFailures.length > 0) {
      const detail = checkFailures.join(", ");
      const message = `필수 체크가 통과하지 않았습니다. ${detail}`;
      await writeAudit("REJECTED", message, "CHECKS_FAIL", {
        ...auditContext,
        result: "REJECTED",
        checkFailures,
      });
      return rejectResult(message, { prUrl, headSha, requiredChecks });
    }

    if (requireClean) {
      const pullWithMergeable = await fetchPullWithMergeableRetry(github, prNumber, pull, {
        maxRetries: 3,
        retryDelayMs: 500,
      });
      mergeableState = asString(pullWithMergeable?.mergeable_state).toLowerCase() || "unknown";
      auditContext = buildAuditContext({
        ...auditContext,
        mergeableState,
      });

      const mergeable = evaluateMergeableState(mergeableState);
      if (!mergeable.ok) {
        const reasonCode = mergeable.reasonCode ?? "NOT_CLEAN";
        const message = mergeable.reasonMessage || "mergeable_state clean 조건을 충족하지 않습니다.";
        await writeAudit("REJECTED", message, reasonCode, {
          ...auditContext,
          result: "REJECTED",
        });
        return rejectResult(message, { prUrl, headSha, requiredChecks });
      }
    }

    let approvalsCount = 0;
    if (minApprovals > 0) {
      approvalsCount = await fetchApprovalsCount(github, prNumber);
      auditContext = buildAuditContext({
        ...auditContext,
        approvalsCount,
      });
      if (approvalsCount < minApprovals) {
        const message = `리뷰 승인 부족: approvals ${approvalsCount}/${minApprovals}`;
        await writeAudit("REJECTED", message, "APPROVALS_MISSING", {
          ...auditContext,
          result: "REJECTED",
        });
        return rejectResult(message, { prUrl, headSha, requiredChecks });
      }
    }

    const expectedConfirm = buildExpectedConfirmText(prNumber, headSha, confirmTemplate);
    if (confirmText !== expectedConfirm) {
      const message = `확인 문구가 일치하지 않습니다. 정확히 "${expectedConfirm}" 를 입력해 주세요.`;
      await writeAudit("REJECTED", message, "CONFIRM_MISMATCH", {
        ...auditContext,
        expectedConfirm,
        result: "REJECTED",
      });
      return rejectResult(message, { prUrl, headSha, requiredChecks });
    }

    const mergePayload = await github.request<MergeApiResponse>(`/pulls/${prNumber}/merge`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        merge_method: mergeMethod,
      }),
    });

    const merged = mergePayload?.merged === true;
    if (!merged) {
      const message = `GitHub merge 실패: ${asString(mergePayload?.message) || "merge failed"}`;
      await writeAudit("ERROR", message, "MERGE_API_FAIL", {
        ...auditContext,
        result: "ERROR",
      });
      return rejectResult(message, { prUrl, headSha, requiredChecks });
    }

    const mergeCommitSha = asString(mergePayload?.sha);
    const message = `PR #${prNumber} 병합이 완료되었습니다.`;
    await writeAudit("SUCCESS", message, "MERGED", {
      ...auditContext,
      result: "SUCCESS",
      mergeCommitSha,
    });

    return {
      ok: true,
      merged: true,
      message,
      prUrl,
      headSha,
      requiredChecks,
      ...(mergeCommitSha ? { mergeCommitSha } : {}),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "병합 처리 중 오류가 발생했습니다.";
    await writeAudit("ERROR", message, "INTERNAL", {
      ...auditContext,
      prUrl,
      headSha,
      result: "ERROR",
    });
    return rejectResult(message, { prUrl, headSha, requiredChecks });
  } finally {
    await lock.release();
  }
}
