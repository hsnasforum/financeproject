export const PLANNING_DESKTOP_SESSION_COOKIE: "planning.desktop-session";

type HeaderReader = Pick<Headers, "get">;
type RequestLike = { headers: HeaderReader };

export function isDesktopLoopbackHost(headers: HeaderReader | undefined): boolean;
export function hasForbiddenDesktopForwardedHeaders(headers: HeaderReader | undefined): boolean;
export function hasRawDesktopIdentityHeaders(headers: HeaderReader | undefined): boolean;

export type DesktopSessionDecision =
  | Readonly<{
      ok: true;
      userId: "default";
      source: "desktop-local-session";
    }>
  | Readonly<{
      ok: false;
      code:
        | "NOT_DESKTOP_LOCAL"
        | "DEPLOYMENT_NOT_READY"
        | "HOST_FORBIDDEN"
        | "FORWARDED_HEADERS_FORBIDDEN"
        | "RAW_IDENTITY_HEADERS_FORBIDDEN"
        | "SESSION_REQUIRED";
      policyCode?: string;
      conflicts?: readonly string[];
    }>;

export function evaluateDesktopSessionRequest(
  request: RequestLike | undefined,
  env?: NodeJS.ProcessEnv,
): DesktopSessionDecision;
