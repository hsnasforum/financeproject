import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { AutoMergeClient } from "@/components/AutoMergeClient";
import { getGithubClient } from "@/lib/github/client";
import { requireGithubEnv } from "@/lib/github/env";
import { buildEffectiveAutoMergePolicy, loadAutoMergePolicy } from "@/lib/ops/autoMergePolicy";
import type {
  AutoMergeCheckItem,
  AutoMergeCheckState,
  AutoMergeViewCandidate,
} from "@/lib/github/autoMergeView";

type PullListApiItem = {
  number?: number;
  state?: string;
  draft?: boolean;
  title?: string;
  html_url?: string;
  updated_at?: string;
  labels?: Array<{ name?: string } | null>;
  user?: {
    login?: string;
  } | null;
  head?: {
    sha?: string;
    ref?: string;
  } | null;
} | null;

type CheckRunApiItem = {
  name?: string;
  status?: string;
  conclusion?: string | null;
} | null;

type CheckRunsApiPayload = {
  check_runs?: CheckRunApiItem[];
} | null;

type StatusApiItem = {
  context?: string;
  state?: string;
} | null;

type CombinedStatusApiPayload = {
  statuses?: StatusApiItem[];
  contexts?: StatusApiItem[];
} | null;

type PullSummary = {
  number: number;
  state: string;
  draft: boolean;
  title: string;
  prUrl: string;
  labels: string[];
  updatedAt: string;
  author: string;
  headSha: string;
  headRef: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCheckKey(value: string): string {
  return asString(value).toLowerCase();
}

function normalizePull(raw: PullListApiItem): PullSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const number = typeof raw.number === "number" && Number.isFinite(raw.number) ? Math.trunc(raw.number) : 0;
  const prUrl = asString(raw.html_url);
  if (!number || !prUrl) return null;
  return {
    number,
    state: asString(raw.state),
    draft: raw.draft === true,
    title: asString(raw.title),
    prUrl,
    labels: (Array.isArray(raw.labels) ? raw.labels : [])
      .map((item) => asString(item?.name))
      .filter((item) => item.length > 0),
    updatedAt: asString(raw.updated_at),
    author: asString(raw.user?.login),
    headSha: asString(raw.head?.sha),
    headRef: asString(raw.head?.ref),
  };
}

function buildExpectedConfirmText(prNumber: number, headSha: string, template: string): string {
  return template
    .replaceAll("{PR}", String(prNumber))
    .replaceAll("{SHA7}", headSha.slice(0, 7));
}

function summarizeCheckItems(items: AutoMergeCheckItem[], source: "check-runs" | "status" | "unknown"): {
  summary: AutoMergeCheckState;
  total: number;
  passed: number;
  failed: number;
  pending: number;
} {
  const total = items.length;
  const passed = items.filter((item) => item.state === "PASS").length;
  const failed = items.filter((item) => item.state === "FAIL").length;
  const pending = items.filter((item) => item.state === "PENDING").length;

  let summary: AutoMergeCheckState = "PASS";
  if (source === "unknown") {
    summary = "UNKNOWN";
  } else if (failed > 0) {
    summary = "FAIL";
  } else if (pending > 0) {
    summary = "PENDING";
  }

  return {
    summary,
    total,
    passed,
    failed,
    pending,
  };
}

function evaluateFromCheckRuns(requiredChecks: string[], payload: CheckRunsApiPayload): AutoMergeCheckItem[] {
  const rows = Array.isArray(payload?.check_runs) ? payload.check_runs : [];
  return requiredChecks.map((requiredName) => {
    const key = normalizeCheckKey(requiredName);
    const matches = rows
      .filter((row) => row && typeof row === "object" && normalizeCheckKey(asString(row.name)) === key)
      .map((row) => ({
        status: normalizeCheckKey(asString(row?.status)),
        conclusion: normalizeCheckKey(asString(row?.conclusion)),
      }));

    if (matches.length < 1) {
      return { name: requiredName, state: "FAIL" as const, detail: "missing" };
    }
    if (matches.some((row) => row.status === "completed" && row.conclusion === "success")) {
      return { name: requiredName, state: "PASS" as const, detail: "success" };
    }
    if (matches.some((row) => row.status !== "completed")) {
      return { name: requiredName, state: "PENDING" as const, detail: "pending" };
    }
    const failedConclusion = matches.find((row) => row.conclusion && row.conclusion !== "success")?.conclusion || "failed";
    return { name: requiredName, state: "FAIL" as const, detail: failedConclusion };
  });
}

function evaluateFromStatus(requiredChecks: string[], payload: CombinedStatusApiPayload): AutoMergeCheckItem[] {
  const statuses = [
    ...(Array.isArray(payload?.statuses) ? payload.statuses : []),
    ...(Array.isArray(payload?.contexts) ? payload.contexts : []),
  ];
  return requiredChecks.map((requiredName) => {
    const key = normalizeCheckKey(requiredName);
    const matches = statuses
      .filter((row) => row && typeof row === "object" && normalizeCheckKey(asString(row.context)) === key)
      .map((row) => normalizeCheckKey(asString(row?.state)));

    if (matches.length < 1) {
      return { name: requiredName, state: "FAIL" as const, detail: "missing" };
    }
    if (matches.some((state) => state === "success")) {
      return { name: requiredName, state: "PASS" as const, detail: "success" };
    }
    if (matches.some((state) => state === "pending")) {
      return { name: requiredName, state: "PENDING" as const, detail: "pending" };
    }
    const failedState = matches.find((state) => state && state !== "success") || "failed";
    return { name: requiredName, state: "FAIL" as const, detail: failedState };
  });
}

async function resolveChecks(
  github: ReturnType<typeof getGithubClient>,
  headSha: string,
  requiredChecks: string[],
): Promise<{
  source: "check-runs" | "status" | "unknown";
  items: AutoMergeCheckItem[];
}> {
  if (!headSha) {
    return {
      source: "unknown",
      items: requiredChecks.map((name) => ({
        name,
        state: "UNKNOWN",
        detail: "head SHA missing",
      })),
    };
  }

  try {
    const payload = await github.request<CheckRunsApiPayload>(`/commits/${encodeURIComponent(headSha)}/check-runs?per_page=100`);
    return {
      source: "check-runs",
      items: evaluateFromCheckRuns(requiredChecks, payload),
    };
  } catch {
    try {
      const payload = await github.request<CombinedStatusApiPayload>(`/commits/${encodeURIComponent(headSha)}/status`);
      return {
        source: "status",
        items: evaluateFromStatus(requiredChecks, payload),
      };
    } catch {
      return {
        source: "unknown",
        items: requiredChecks.map((name) => ({
          name,
          state: "UNKNOWN",
          detail: "checks lookup failed",
        })),
      };
    }
  }
}

async function mapWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
  if (items.length < 1) return [];
  const results = new Array<U>(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index] as T, index);
    }
  });
  await Promise.allSettled(workers);
  return results;
}

async function buildCandidate(
  github: ReturnType<typeof getGithubClient>,
  requiredChecks: string[],
  confirmTemplate: string,
  requiredLabel: string,
  pull: PullSummary,
): Promise<AutoMergeViewCandidate> {
  const checks = await resolveChecks(github, pull.headSha, requiredChecks);
  const summary = summarizeCheckItems(checks.items, checks.source);
  const reasons: string[] = [];

  if (pull.state !== "open") reasons.push(`State is ${pull.state || "-"}`);
  if (pull.draft) reasons.push("Draft PR");
  if (!pull.headSha) reasons.push("Head SHA missing");
  if (!pull.labels.some((label) => normalizeCheckKey(label) === normalizeCheckKey(requiredLabel))) {
    reasons.push(`Missing label: ${requiredLabel}`);
  }

  const checkIssues = checks.items
    .filter((item) => item.state !== "PASS")
    .map((item) => `${item.name}: ${item.detail}`);
  if (summary.summary === "PENDING") reasons.push("Checks pending");
  if (summary.summary === "FAIL") reasons.push("Checks failed");
  if (summary.summary === "UNKNOWN") reasons.push("Unknown checks");
  if (checkIssues.length > 0) reasons.push(...checkIssues);

  return {
    number: pull.number,
    title: pull.title,
    prUrl: pull.prUrl,
    labels: pull.labels,
    state: pull.state,
    draft: pull.draft,
    headSha: pull.headSha,
    headRef: pull.headRef,
    author: pull.author,
    updatedAt: pull.updatedAt,
    expectedConfirmText: buildExpectedConfirmText(pull.number, pull.headSha, confirmTemplate),
    eligibility: {
      ok: reasons.length < 1,
      reasons,
    },
    checks: {
      summary: summary.summary,
      source: checks.source,
      total: summary.total,
      passed: summary.passed,
      failed: summary.failed,
      pending: summary.pending,
      items: checks.items,
    },
  };
}

export default async function OpsAutoMergePage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const cookieStore = await cookies();
  const csrf = cookieStore.get("dev_csrf")?.value ?? "";
  let loadError = "";
  let candidates: AutoMergeViewCandidate[] = [];
  let requiredChecks: string[] = [];
  let confirmTemplate = "MERGE {PR} {SHA7}";
  let requiredLabel = "automerge";
  let autoMergeEnabled = false;
  let autoMergeEnvEnabled = false;
  let autoMergePolicyEnabled = false;
  let mergeMethod: "squash" | "merge" | "rebase" = "squash";
  let armDefaultPollSeconds = 15;
  let armMaxConcurrentPolls = 3;

  try {
    const githubEnv = requireGithubEnv();
    const policy = await loadAutoMergePolicy();
    const effectivePolicy = buildEffectiveAutoMergePolicy(githubEnv, policy);
    requiredChecks = effectivePolicy.requiredChecks;
    confirmTemplate = effectivePolicy.confirmTemplate;
    requiredLabel = effectivePolicy.requiredLabel;
    autoMergeEnabled = effectivePolicy.enabled;
    autoMergeEnvEnabled = effectivePolicy.envEnabledFlag;
    autoMergePolicyEnabled = effectivePolicy.policyEnabled;
    mergeMethod = effectivePolicy.mergeMethod;
    armDefaultPollSeconds = effectivePolicy.arm.defaultPollSeconds;
    armMaxConcurrentPolls = effectivePolicy.arm.maxConcurrentPolls;

    const github = getGithubClient();
    const rows = await github.request<PullListApiItem[]>("/pulls?state=open&sort=updated&direction=desc&per_page=20");
    const pulls = (Array.isArray(rows) ? rows : [])
      .map((row) => normalizePull(row))
      .filter((row): row is PullSummary => row !== null)
      .slice(0, 20);

    candidates = await mapWithConcurrency(
      pulls,
      5,
      async (pull) => buildCandidate(github, requiredChecks, confirmTemplate, requiredLabel, pull),
    );
  } catch (error) {
    loadError = error instanceof Error ? error.message : "PR 목록을 불러오지 못했습니다.";
  }

  return (
    <AutoMergeClient
      csrf={csrf}
      candidates={candidates}
      loadError={loadError}
      requiredChecks={requiredChecks}
      confirmTemplate={confirmTemplate}
      requiredLabel={requiredLabel}
      autoMergeEnabled={autoMergeEnabled}
      autoMergeEnvEnabled={autoMergeEnvEnabled}
      autoMergePolicyEnabled={autoMergePolicyEnabled}
      mergeMethod={mergeMethod}
      armDefaultPollSeconds={armDefaultPollSeconds}
      armMaxConcurrentPolls={armMaxConcurrentPolls}
    />
  );
}
