export type RedactionIssueCode =
  | "INTERNAL_PATH"
  | "GITHUB_TOKEN"
  | "BOK_ECOS_API_KEY"
  | "BEARER"
  | "FINLIFE_KEY";

export type RedactionIssue = {
  code: RedactionIssueCode;
  pattern: string;
};

const LEAK_PATTERNS: Array<{ code: RedactionIssueCode; regex: RegExp; pattern: string }> = [
  { code: "INTERNAL_PATH", regex: /\.data\//i, pattern: ".data/" },
  { code: "GITHUB_TOKEN", regex: /GITHUB_TOKEN/i, pattern: "GITHUB_TOKEN" },
  { code: "BOK_ECOS_API_KEY", regex: /BOK_ECOS_API_KEY|ECOS_API_KEY/i, pattern: "BOK_ECOS_API_KEY" },
  { code: "BEARER", regex: /Bearer\s+/i, pattern: "Bearer " },
  { code: "FINLIFE_KEY", regex: /FINLIFE_[A-Z0-9_]*(KEY|TOKEN)/i, pattern: "FINLIFE_*KEY|TOKEN" },
];

function stringifyPayload(payload: unknown): string {
  if (typeof payload === "string") return payload;
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

export function findRedactionIssues(payload: unknown): RedactionIssue[] {
  const text = stringifyPayload(payload);
  const issues: RedactionIssue[] = [];
  for (const candidate of LEAK_PATTERNS) {
    if (!candidate.regex.test(text)) continue;
    issues.push({
      code: candidate.code,
      pattern: candidate.pattern,
    });
  }
  return issues;
}

export function hasRedactionIssue(payload: unknown): boolean {
  return findRedactionIssues(payload).length > 0;
}
