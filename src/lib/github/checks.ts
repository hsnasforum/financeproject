type PullResponse = {
  head?: {
    sha?: string;
  };
} | null;

type CheckRunApiItem = {
  status?: string;
  conclusion?: string | null;
  details_url?: string | null;
  html_url?: string | null;
} | null;

type CheckRunsResponse = {
  check_runs?: CheckRunApiItem[];
} | null;

export type CheckSummaryState = "RUNNING" | "PASSED" | "FAILED";

export type CheckRunsSummary = {
  state: CheckSummaryState;
  total: number;
  completed: number;
  failed: number;
  detailsUrl: string | null;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toHeaders(token: string, userAgent: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": userAgent,
  };
}

export async function getPrHeadSha(owner: string, repo: string, number: number, token: string): Promise<string | null> {
  const safeOwner = asString(owner);
  const safeRepo = asString(repo);
  const safeToken = asString(token);
  if (!safeOwner || !safeRepo || !safeToken || !Number.isFinite(number) || number <= 0) return null;

  const endpoint = `https://api.github.com/repos/${encodeURIComponent(safeOwner)}/${encodeURIComponent(safeRepo)}/pulls/${Math.trunc(number)}`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: toHeaders(safeToken, "finance-dev-pr-head"),
  });
  if (!response.ok) return null;

  const payload = (await response.json().catch(() => null)) as PullResponse;
  const sha = asString(payload?.head?.sha);
  return sha || null;
}

function isFailedConclusion(value: string): boolean {
  return value !== "success";
}

export async function getCheckRunsSummary(owner: string, repo: string, sha: string, token: string): Promise<CheckRunsSummary> {
  const safeOwner = asString(owner);
  const safeRepo = asString(repo);
  const safeSha = asString(sha);
  const safeToken = asString(token);
  if (!safeOwner || !safeRepo || !safeSha || !safeToken) {
    return { state: "FAILED", total: 0, completed: 0, failed: 0, detailsUrl: null };
  }

  const endpoint = new URL(`https://api.github.com/repos/${encodeURIComponent(safeOwner)}/${encodeURIComponent(safeRepo)}/commits/${encodeURIComponent(safeSha)}/check-runs`);
  endpoint.searchParams.set("per_page", "100");

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    headers: toHeaders(safeToken, "finance-dev-pr-checks"),
  });
  if (!response.ok) {
    throw new Error(`check-runs request failed (${response.status})`);
  }

  const payload = (await response.json().catch(() => null)) as CheckRunsResponse;
  const runs = Array.isArray(payload?.check_runs) ? payload.check_runs : [];
  const total = runs.length;
  const completed = runs.filter((row) => asString(row?.status) === "completed").length;
  const failed = runs.filter((row) => {
    if (asString(row?.status) !== "completed") return false;
    return isFailedConclusion(asString(row?.conclusion));
  }).length;

  const hasRunning = runs.some((row) => asString(row?.status) !== "completed");
  let state: CheckSummaryState = "FAILED";
  if (hasRunning) {
    state = "RUNNING";
  } else if (failed === 0) {
    state = "PASSED";
  } else {
    state = "FAILED";
  }

  const failedDetail = runs.find((row) => {
    if (asString(row?.status) !== "completed") return false;
    return isFailedConclusion(asString(row?.conclusion));
  });
  const firstDetail = failedDetail ?? runs[0] ?? null;
  const detailsUrl = asString(firstDetail?.details_url) || asString(firstDetail?.html_url) || null;

  return {
    state,
    total,
    completed,
    failed,
    detailsUrl,
  };
}
