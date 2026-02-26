import { pathToId } from "./ids";

export const A11Y_ANNOUNCE_EVENT = "forms:a11y:announce";

function focusElementById(id: string): boolean {
  if (typeof document === "undefined") return false;
  const node = document.getElementById(id);
  if (!(node instanceof HTMLElement)) return false;
  node.focus();
  return true;
}

export function focusFirstError(paths: string[]): boolean {
  for (const path of paths) {
    if (focusElementById(pathToId(path))) return true;
  }
  return false;
}

export function scrollToErrorSummary(summaryId = "form_error_summary"): void {
  if (typeof document === "undefined") return;
  const node = document.getElementById(summaryId);
  if (!(node instanceof HTMLElement)) return;
  node.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function announce(message: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string>(A11Y_ANNOUNCE_EVENT, { detail: message }));
}
