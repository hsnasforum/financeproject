export type Issue = {
  path: string;
  message: string;
};

export type ParseResult<T> = {
  ok: boolean;
  value: T;
  issues: Issue[];
};

export function buildParseResult<T>(value: T, issues: Issue[]): ParseResult<T> {
  return {
    ok: issues.length === 0,
    value,
    issues,
  };
}

export function issue(path: string, message: string): Issue {
  return { path, message };
}

export function parseStringIssues(items: string[]): Issue[] {
  return items.map((entry) => {
    const text = entry.trim();
    if (!text) return issue("input", "is invalid");
    const firstSpace = text.indexOf(" ");
    if (firstSpace <= 0) return issue(text, "is invalid");
    return issue(text.slice(0, firstSpace), text.slice(firstSpace + 1));
  });
}
