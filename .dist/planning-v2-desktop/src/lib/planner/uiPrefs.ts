export type LinkOpenMode = "quickview" | "newtab";

const STORAGE_KEY = "finlife_planner_link_open_mode_v1";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getLinkOpenMode(): LinkOpenMode {
  if (!isBrowser()) return "quickview";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "newtab" || saved === "quickview") return saved;
  return "quickview";
}

export function setLinkOpenMode(mode: LinkOpenMode): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, mode);
}
