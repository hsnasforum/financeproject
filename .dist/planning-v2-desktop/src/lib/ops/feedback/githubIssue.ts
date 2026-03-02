import { getGithubClient } from "../../github/client";

export type CreateIssueInput = {
  title: string;
  body: string;
  labels?: string[];
};

type GithubIssueCreateResponse = {
  number?: number;
  html_url?: string;
  url?: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    const label = asString(row).slice(0, 50);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
    if (out.length >= 20) break;
  }
  return out;
}

export async function createGithubIssue(input: CreateIssueInput): Promise<{ number: number; url: string }> {
  const title = asString(input.title).slice(0, 240);
  const body = asString(input.body);
  const labels = normalizeLabels(input.labels);

  if (!title) {
    throw new Error("Issue 제목이 비어 있습니다.");
  }
  if (!body) {
    throw new Error("Issue 본문이 비어 있습니다.");
  }

  try {
    const github = getGithubClient();
    const response = await github.request<GithubIssueCreateResponse>("/issues", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        body,
        ...(labels.length > 0 ? { labels } : {}),
      }),
    });

    const number = Math.trunc(Number(response?.number));
    const url = asString(response?.html_url) || asString(response?.url);
    if (!Number.isFinite(number) || number <= 0 || !url) {
      throw new Error("GitHub 이슈 생성 응답이 올바르지 않습니다.");
    }

    return {
      number,
      url,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub 이슈 생성에 실패했습니다.";
    throw new Error(`GitHub 이슈 생성 실패: ${message}`);
  }
}
