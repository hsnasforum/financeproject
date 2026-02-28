type GithubPullItem = {
  number?: number;
  title?: string;
  html_url?: string;
  created_at?: string;
} | null;

export type FindOpenPrByHeadInput = {
  owner: string;
  repo: string;
  head: string;
  token: string;
};

export type OpenPrSummary = {
  prUrl: string;
  number: number;
  title: string;
  createdAt: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toTimeMs(value: string): number {
  const parsed = Date.parse(asString(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePr(raw: GithubPullItem): OpenPrSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const number = typeof raw.number === "number" && Number.isFinite(raw.number) ? raw.number : 0;
  const prUrl = asString(raw.html_url);
  if (!number || !prUrl) return null;
  return {
    prUrl,
    number,
    title: asString(raw.title),
    createdAt: asString(raw.created_at),
  };
}

export async function findOpenPrByHead(input: FindOpenPrByHeadInput): Promise<OpenPrSummary | null> {
  const owner = asString(input.owner);
  const repo = asString(input.repo);
  const head = asString(input.head);
  const token = asString(input.token);
  if (!owner || !repo || !head || !token) return null;

  const endpoint = new URL(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`);
  endpoint.searchParams.set("state", "open");
  endpoint.searchParams.set("head", `${owner}:${head}`);

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "finance-dev-pr-lookup",
    },
  });

  if (!response.ok) return null;

  const payload = (await response.json().catch(() => null)) as GithubPullItem[] | null;
  const rows = Array.isArray(payload)
    ? payload.map((row) => normalizePr(row)).filter((row): row is OpenPrSummary => row !== null)
    : [];
  if (rows.length < 1) return null;

  rows.sort((a, b) => {
    const timeDiff = toTimeMs(b.createdAt) - toTimeMs(a.createdAt);
    if (timeDiff !== 0) return timeDiff;
    return b.number - a.number;
  });
  return rows[0] ?? null;
}
