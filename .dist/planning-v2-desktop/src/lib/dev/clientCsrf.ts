const DEV_CSRF_SESSION_KEY = "dev_action_csrf_v1";

export function readDevCsrfToken(): string {
  if (typeof window === "undefined") return "";
  return (window.sessionStorage.getItem(DEV_CSRF_SESSION_KEY) ?? "").trim();
}

export function withDevCsrf<T extends Record<string, unknown>>(payload: T): T & { csrf?: string } {
  const csrf = readDevCsrfToken();
  if (!csrf) return payload as T & { csrf?: string };
  return {
    ...payload,
    csrf,
  };
}
