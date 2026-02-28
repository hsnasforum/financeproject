type WorkflowRunsApiItem = {
  id?: number;
  html_url?: string;
  event?: string;
  head_branch?: string;
  created_at?: string;
  run_started_at?: string;
  updated_at?: string;
} | null;

type WorkflowRunsApiPayload = {
  workflow_runs?: WorkflowRunsApiItem[];
} | null;

export type ListWorkflowRunsInput = {
  owner: string;
  repo: string;
  workflow: string;
  ref: string;
  token: string;
  since?: string | number | Date | null;
  perPage?: number;
};

export type WorkflowRunSummary = {
  id: number | null;
  htmlUrl: string;
  event: string;
  headBranch: string;
  createdAt: string;
  runStartedAt: string;
  updatedAt: string;
};

export type ListWorkflowRunsResult = {
  runUrl: string | null;
  runs: WorkflowRunSummary[];
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toTimeMs(value: unknown): number {
  const text = asString(value);
  if (!text) return Number.NaN;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeSinceMs(value: ListWorkflowRunsInput["since"]): number | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Date.parse(asString(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePerPage(value: number | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 10;
  return Math.max(1, Math.min(100, Math.trunc(parsed)));
}

function normalizeRun(raw: WorkflowRunsApiItem): WorkflowRunSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const htmlUrl = asString(raw.html_url);
  const event = asString(raw.event);
  const headBranch = asString(raw.head_branch);
  const createdAt = asString(raw.created_at);
  const runStartedAt = asString(raw.run_started_at);
  const updatedAt = asString(raw.updated_at);
  const id = typeof raw.id === "number" && Number.isFinite(raw.id) ? raw.id : null;
  return {
    id,
    htmlUrl,
    event,
    headBranch,
    createdAt,
    runStartedAt,
    updatedAt,
  };
}

function runTimeSortKey(run: WorkflowRunSummary): number {
  const started = toTimeMs(run.runStartedAt);
  if (Number.isFinite(started)) return started;
  const created = toTimeMs(run.createdAt);
  if (Number.isFinite(created)) return created;
  return 0;
}

export async function listWorkflowRuns(input: ListWorkflowRunsInput): Promise<ListWorkflowRunsResult> {
  const owner = asString(input.owner);
  const repo = asString(input.repo);
  const workflow = asString(input.workflow);
  const ref = asString(input.ref);
  const token = asString(input.token);
  const perPage = normalizePerPage(input.perPage);
  const sinceMs = normalizeSinceMs(input.since);

  if (!owner || !repo || !workflow || !ref || !token) {
    return { runUrl: null, runs: [] };
  }

  const endpoint = new URL(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflow)}/runs`);
  endpoint.searchParams.set("event", "workflow_dispatch");
  endpoint.searchParams.set("branch", ref);
  endpoint.searchParams.set("per_page", String(perPage));

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "finance-dev-runs",
    },
  });

  if (!response.ok) {
    return { runUrl: null, runs: [] };
  }

  const payload = (await response.json().catch(() => null)) as WorkflowRunsApiPayload;
  const runs = Array.isArray(payload?.workflow_runs)
    ? payload.workflow_runs.map((row) => normalizeRun(row)).filter((row): row is WorkflowRunSummary => row !== null)
    : [];

  const matched = runs
    .filter((run) => run.event === "workflow_dispatch")
    .filter((run) => run.headBranch === ref)
    .filter((run) => {
      if (sinceMs === null) return true;
      const createdMs = toTimeMs(run.createdAt);
      const startedMs = toTimeMs(run.runStartedAt);
      if (Number.isFinite(startedMs)) return startedMs >= sinceMs;
      if (Number.isFinite(createdMs)) return createdMs >= sinceMs;
      return false;
    })
    .sort((a, b) => runTimeSortKey(b) - runTimeSortKey(a));

  const runUrl = matched.find((run) => run.htmlUrl)?.htmlUrl ?? null;
  return {
    runUrl,
    runs: matched,
  };
}
