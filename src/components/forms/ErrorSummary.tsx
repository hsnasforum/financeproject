import { type Issue } from "@/lib/schemas/issueTypes";
import { pathToId } from "@/lib/forms/ids";

type ErrorSummaryProps = {
  issues: Issue[];
  title?: string;
  className?: string;
  id?: string;
  onIssueClick?: (issue: Issue) => void;
};

function defaultIssueClick(issue: Issue) {
  if (typeof document === "undefined") return;
  const node = document.getElementById(pathToId(issue.path));
  if (!(node instanceof HTMLElement)) return;
  node.focus();
}

export function ErrorSummary({ issues, title = "입력값을 확인해 주세요.", className, id = "form_error_summary", onIssueClick }: ErrorSummaryProps) {
  if (issues.length === 0) return null;
  return (
    <section id={id} className={`rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 ${className ?? ""}`.trim()} role="alert" tabIndex={-1}>
      <p className="text-sm font-semibold text-rose-800">{title}</p>
      <ul className="mt-1 list-disc pl-5 text-xs text-rose-700">
        {issues.map((entry, index) => (
          <li key={`${entry.path}-${entry.message}-${index}`}>
            <button
              type="button"
              className="text-left underline-offset-2 hover:underline"
              onClick={() => (onIssueClick ?? defaultIssueClick)(entry)}
            >
              <span className="font-medium">{entry.path}</span>: {entry.message}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
