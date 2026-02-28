import { githubRequest, readGitHubRepoConfig, type GitHubRepoConfig } from "./client";

type PullsListApiItem = {
  number?: number;
  state?: string;
  draft?: boolean;
  title?: string;
  html_url?: string;
  updated_at?: string;
  user?: {
    login?: string;
  } | null;
  head?: {
    sha?: string;
    ref?: string;
  } | null;
} | null;

type PullApiItem = PullsListApiItem;

type CheckRunApiItem = {
  name?: string;
  status?: string;
  conclusion?: string | null;
  details_url?: string | null;
  html_url?: string | null;
} | null;

type CheckRunsApiPayload = {
  check_runs?: CheckRunApiItem[];
} | null;

type StatusContextApiItem = {
  context?: string;
  state?: string;
  target_url?: string | null;
} | null;

type CombinedStatusApiPayload = {
  contexts?: StatusContextApiItem[];
} | null;

type MergeApiPayload = {
  sha?: string;
  merged?: boolean;
  message?: string;
} | null;

export type AutoMergeSettings = {
  config: GitHubRepoConfig;
  requiredChecks: string[];
  confirmTemplate: string;
};

export type AutoMergeSettingsResult =
  | { ok: true; data: AutoMergeSettings; missing: [] }
  | { ok: false; data: null; missing: string[] };

export type PullRequestSummary = {
  number: number;
  state: string;
  draft: boolean;
  title: string;
  htmlUrl: string;
  updatedAt: string;
  headSha: string;
  headRef: string;
  author: string;
};

export type CheckState = "success" | "pending" | "failed" | "missing";

export type RequiredCheckResult = {
  name: string;
  state: CheckState;
  source: "check-run" | "status" | "missing";
  detail: string;
  detailsUrl: string | null;
};

export type RequiredChecksSummary = {
  allSuccess: boolean;
  state: "PASSED" | "RUNNING" | "FAILED";
  total: number;
  completed: number;
  failed: number;
  detailsUrl: string | null;
  results: RequiredCheckResult[];
};

export type MergeApiResult = {
  merged: boolean;
  message: string;
  sha: string | null;
};

export type AutoMergeCandidate = {
  number: number;
  title: string;
  prUrl: string;
  state: string;
  draft: boolean;
  headSha: string;
  headRef: string;
  author: string;
  updatedAt: string;
  expectedConfirmText: string;
  eligibility: {
    ok: boolean;
    reasons: string[];
  };
  checks: {
    state: "PASSED" | "RUNNING" | "FAILED";
    total: number;
    completed: number;
    failed: number;
    detailsUrl: string | null;
  };
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCheckName(value: string): string {
  return asString(value).toLowerCase();
}

function parseRequiredChecks(raw: string): string[] {
  const rows = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const dedup = new Set<string>();
  const result: string[] = [];
  for (const row of rows) {
    const key = normalizeCheckName(row);
    if (!key || dedup.has(key)) continue;
    dedup.add(key);
    result.push(row);
  }
  return result;
}

function normalizePull(raw: PullsListApiItem): PullRequestSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const number = typeof raw.number === "number" && Number.isFinite(raw.number) ? Math.trunc(raw.number) : 0;
  const htmlUrl = asString(raw.html_url);
  const headSha = asString(raw.head?.sha);
  if (!number || !htmlUrl || !headSha) return null;
  return {
    number,
    state: asString(raw.state),
    draft: raw.draft === true,
    title: asString(raw.title),
    htmlUrl,
    updatedAt: asString(raw.updated_at),
    headSha,
    headRef: asString(raw.head?.ref),
    author: asString(raw.user?.login),
  };
}

function normalizeCheckRun(raw: CheckRunApiItem): {
  name: string;
  status: string;
  conclusion: string;
  detailsUrl: string | null;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const name = asString(raw.name);
  if (!name) return null;
  return {
    name,
    status: asString(raw.status).toLowerCase(),
    conclusion: asString(raw.conclusion).toLowerCase(),
    detailsUrl: asString(raw.details_url) || asString(raw.html_url) || null,
  };
}

function normalizeStatusContext(raw: StatusContextApiItem): {
  name: string;
  state: string;
  detailsUrl: string | null;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const name = asString(raw.context);
  if (!name) return null;
  return {
    name,
    state: asString(raw.state).toLowerCase(),
    detailsUrl: asString(raw.target_url) || null,
  };
}

function summarizeRequiredChecks(results: RequiredCheckResult[]): RequiredChecksSummary {
  const total = results.length;
  const failed = results.filter((row) => row.state === "failed" || row.state === "missing").length;
  const completed = results.filter((row) => row.state === "success" || row.state === "failed").length;
  const hasPendingOrMissing = results.some((row) => row.state === "pending" || row.state === "missing");
  const hasFailed = results.some((row) => row.state === "failed");

  let state: "PASSED" | "RUNNING" | "FAILED" = "PASSED";
  if (hasFailed) {
    state = "FAILED";
  } else if (hasPendingOrMissing) {
    state = "RUNNING";
  }

  const firstDetail = results.find((row) => row.state !== "success" && row.detailsUrl)?.detailsUrl
    ?? results.find((row) => row.detailsUrl)?.detailsUrl
    ?? null;

  return {
    allSuccess: results.every((row) => row.state === "success"),
    state,
    total,
    completed,
    failed,
    detailsUrl: firstDetail,
    results,
  };
}

function evaluateRequiredChecks(
  requiredChecks: string[],
  checkRuns: Array<{ name: string; status: string; conclusion: string; detailsUrl: string | null }>,
  statusContexts: Array<{ name: string; state: string; detailsUrl: string | null }>,
): RequiredChecksSummary {
  const results: RequiredCheckResult[] = requiredChecks.map((requiredOriginal) => {
    const required = normalizeCheckName(requiredOriginal);
    const runMatches = checkRuns.filter((row) => normalizeCheckName(row.name) === required);
    const contextMatches = statusContexts.filter((row) => normalizeCheckName(row.name) === required);

    if (runMatches.some((row) => row.status === "completed" && row.conclusion === "success")) {
      const hit = runMatches.find((row) => row.status === "completed" && row.conclusion === "success") ?? runMatches[0];
      return {
        name: requiredOriginal,
        state: "success",
        source: "check-run",
        detail: "check-run success",
        detailsUrl: hit?.detailsUrl ?? null,
      };
    }

    if (runMatches.some((row) => row.status !== "completed")) {
      const hit = runMatches.find((row) => row.status !== "completed") ?? runMatches[0];
      return {
        name: requiredOriginal,
        state: "pending",
        source: "check-run",
        detail: "check-run pending",
        detailsUrl: hit?.detailsUrl ?? null,
      };
    }

    if (runMatches.length > 0) {
      const hit = runMatches[0];
      return {
        name: requiredOriginal,
        state: "failed",
        source: "check-run",
        detail: `check-run ${hit?.conclusion || "failed"}`,
        detailsUrl: hit?.detailsUrl ?? null,
      };
    }

    if (contextMatches.some((row) => row.state === "success")) {
      const hit = contextMatches.find((row) => row.state === "success") ?? contextMatches[0];
      return {
        name: requiredOriginal,
        state: "success",
        source: "status",
        detail: "status success",
        detailsUrl: hit?.detailsUrl ?? null,
      };
    }

    if (contextMatches.some((row) => row.state === "pending")) {
      const hit = contextMatches.find((row) => row.state === "pending") ?? contextMatches[0];
      return {
        name: requiredOriginal,
        state: "pending",
        source: "status",
        detail: "status pending",
        detailsUrl: hit?.detailsUrl ?? null,
      };
    }

    if (contextMatches.some((row) => row.state === "failure" || row.state === "error")) {
      const hit = contextMatches.find((row) => row.state === "failure" || row.state === "error") ?? contextMatches[0];
      return {
        name: requiredOriginal,
        state: "failed",
        source: "status",
        detail: `status ${hit?.state || "failure"}`,
        detailsUrl: hit?.detailsUrl ?? null,
      };
    }

    return {
      name: requiredOriginal,
      state: "missing",
      source: "missing",
      detail: "required check not found",
      detailsUrl: null,
    };
  });

  return summarizeRequiredChecks(results);
}

export function readAutoMergeSettings(env: NodeJS.ProcessEnv = process.env): AutoMergeSettingsResult {
  const configResult = readGitHubRepoConfig(env);
  if (!configResult.ok) {
    return configResult;
  }

  const rawChecks = asString(env.AUTO_MERGE_REQUIRED_CHECKS) || "CI";
  const requiredChecks = parseRequiredChecks(rawChecks);
  const confirmTemplate = asString(env.AUTO_MERGE_CONFIRM_TEMPLATE) || "MERGE {PR} {SHA7}";

  return {
    ok: true,
    data: {
      config: configResult.data,
      requiredChecks: requiredChecks.length > 0 ? requiredChecks : ["CI"],
      confirmTemplate,
    },
    missing: [],
  };
}

export function buildExpectedConfirmText(prNumber: number, headSha: string, template: string): string {
  const sha7 = asString(headSha).slice(0, 7);
  return template
    .replaceAll("{PR}", String(prNumber))
    .replaceAll("{SHA7}", sha7);
}

export async function fetchPullRequest(config: GitHubRepoConfig, prNumber: number): Promise<PullRequestSummary | null> {
  const response = await githubRequest(config, `/pulls/${Math.trunc(prNumber)}`, "finance-ops-auto-merge-pr");
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as PullApiItem;
  return normalizePull(payload);
}

export async function listOpenPullRequests(config: GitHubRepoConfig, limit = 10): Promise<PullRequestSummary[]> {
  const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit || 10)));
  const response = await githubRequest(
    config,
    `/pulls?state=open&sort=updated&direction=desc&per_page=${safeLimit}`,
    "finance-ops-auto-merge-list",
  );
  if (!response.ok) return [];
  const payload = (await response.json().catch(() => null)) as PullsListApiItem[] | null;
  const rows = Array.isArray(payload)
    ? payload.map((entry) => normalizePull(entry)).filter((entry): entry is PullRequestSummary => entry !== null)
    : [];
  return rows.slice(0, safeLimit);
}

export async function fetchCheckRuns(
  config: GitHubRepoConfig,
  headSha: string,
): Promise<Array<{ name: string; status: string; conclusion: string; detailsUrl: string | null }>> {
  const response = await githubRequest(
    config,
    `/commits/${encodeURIComponent(headSha)}/check-runs?per_page=100`,
    "finance-ops-auto-merge-check-runs",
  );
  if (!response.ok) {
    throw new Error(`check-runs request failed (${response.status})`);
  }
  const payload = (await response.json().catch(() => null)) as CheckRunsApiPayload;
  return Array.isArray(payload?.check_runs)
    ? payload.check_runs.map((entry) => normalizeCheckRun(entry)).filter((entry): entry is { name: string; status: string; conclusion: string; detailsUrl: string | null } => entry !== null)
    : [];
}

export async function fetchCombinedStatus(
  config: GitHubRepoConfig,
  headSha: string,
): Promise<Array<{ name: string; state: string; detailsUrl: string | null }>> {
  const response = await githubRequest(
    config,
    `/commits/${encodeURIComponent(headSha)}/status`,
    "finance-ops-auto-merge-status",
  );
  if (!response.ok) {
    throw new Error(`status request failed (${response.status})`);
  }
  const payload = (await response.json().catch(() => null)) as CombinedStatusApiPayload;
  return Array.isArray(payload?.contexts)
    ? payload.contexts.map((entry) => normalizeStatusContext(entry)).filter((entry): entry is { name: string; state: string; detailsUrl: string | null } => entry !== null)
    : [];
}

export async function resolveRequiredChecks(
  config: GitHubRepoConfig,
  headSha: string,
  requiredChecks: string[],
): Promise<RequiredChecksSummary> {
  try {
    const checkRuns = await fetchCheckRuns(config, headSha);
    return evaluateRequiredChecks(requiredChecks, checkRuns, []);
  } catch {
    const contexts = await fetchCombinedStatus(config, headSha);
    return evaluateRequiredChecks(requiredChecks, [], contexts);
  }
}

export async function mergePullRequest(config: GitHubRepoConfig, prNumber: number): Promise<MergeApiResult> {
  const response = await githubRequest(
    config,
    `/pulls/${Math.trunc(prNumber)}/merge`,
    "finance-ops-auto-merge-merge",
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        merge_method: "squash",
      }),
    },
  );

  const payload = (await response.json().catch(() => null)) as MergeApiPayload;
  const merged = payload?.merged === true && response.ok;
  return {
    merged,
    message: asString(payload?.message) || (merged ? "merged" : `merge failed (${response.status})`),
    sha: asString(payload?.sha) || null,
  };
}

export async function buildAutoMergeCandidate(
  settings: AutoMergeSettings,
  pr: PullRequestSummary,
): Promise<AutoMergeCandidate> {
  const reasons: string[] = [];
  if (pr.state !== "open") reasons.push(`state=${pr.state || "-"}`);
  if (pr.draft) reasons.push("draft PR");

  let checks: RequiredChecksSummary;
  try {
    checks = await resolveRequiredChecks(settings.config, pr.headSha, settings.requiredChecks);
  } catch (error) {
    const message = error instanceof Error ? error.message : "checks lookup failed";
    reasons.push(message);
    checks = {
      allSuccess: false,
      state: "FAILED",
      total: settings.requiredChecks.length,
      completed: 0,
      failed: settings.requiredChecks.length,
      detailsUrl: null,
      results: settings.requiredChecks.map((name) => ({
        name,
        state: "missing",
        source: "missing",
        detail: message,
        detailsUrl: null,
      })),
    };
  }

  if (!checks.allSuccess) {
    for (const row of checks.results) {
      if (row.state === "success") continue;
      reasons.push(`${row.name}: ${row.detail}`);
    }
  }

  return {
    number: pr.number,
    title: pr.title,
    prUrl: pr.htmlUrl,
    state: pr.state,
    draft: pr.draft,
    headSha: pr.headSha,
    headRef: pr.headRef,
    author: pr.author,
    updatedAt: pr.updatedAt,
    expectedConfirmText: buildExpectedConfirmText(pr.number, pr.headSha, settings.confirmTemplate),
    eligibility: {
      ok: reasons.length < 1,
      reasons,
    },
    checks: {
      state: checks.state,
      total: checks.total,
      completed: checks.completed,
      failed: checks.failed,
      detailsUrl: checks.detailsUrl,
    },
  };
}
