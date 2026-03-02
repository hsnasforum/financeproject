import { type Issue } from "@/lib/schemas/issueTypes";
import { normalizeIssuePath } from "./ids";

export type FieldIssueMap = Record<string, string[]>;

export function issuesToFieldMap(issues: Issue[]): FieldIssueMap {
  const map: FieldIssueMap = {};
  for (const entry of issues) {
    const key = normalizeIssuePath(entry.path);
    if (!map[key]) map[key] = [];
    map[key].push(entry.message);
  }
  return map;
}

export function firstError(issues: Issue[]): string | null {
  if (!issues.length) return null;
  const first = issues[0];
  const path = normalizeIssuePath(first.path);
  if (path === "form" || path === "input") return first.message;
  return `${path}: ${first.message}`;
}
