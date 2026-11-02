import { isLocalRequest } from "../../dev/localRequest";
import { evaluateDesktopSessionRequest } from "../deployment/desktopSession.mjs";
import { isDesktopLocalDeploymentRequested } from "../deployment/runtimePolicy.mjs";
import {
  DEFAULT_PLANNING_USER_ID,
  PlanningStorageModeError,
  assertPlanningStorageMode,
  resolvePlanningUserId,
} from "../store/namespace";
import { runWithPlanningUserScope } from "../store/userScope";

export type PlanningCurrentUserSource =
  | "auth-session"
  | "trusted-header"
  | "local-namespace"
  | "desktop-local-session";

export type PlanningCurrentUser = {
  id: string;
  source: PlanningCurrentUserSource;
  authRequired: boolean;
};

export class PlanningAuthError extends Error {
  readonly code:
    | "UNAUTHENTICATED"
    | "FORBIDDEN"
    | "INVALID_STORAGE_MODE"
    | "DEPLOYMENT_NOT_READY";
  readonly status: number;
  readonly recovery: "sign-in" | "desktop-launcher";

  constructor(
    code: "UNAUTHENTICATED" | "FORBIDDEN" | "INVALID_STORAGE_MODE" | "DEPLOYMENT_NOT_READY",
    message: string,
    status: number,
    recovery: "sign-in" | "desktop-launcher" = "sign-in",
  ) {
    super(message);
    this.name = "PlanningAuthError";
    this.code = code;
    this.status = status;
    this.recovery = recovery;
  }
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  return fallback;
}

function defaultPlanningAuthRequired(): boolean {
  return true;
}

function isProductionEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.NODE_ENV ?? "").trim().toLowerCase() === "production";
}

export function isPlanningAuthRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isProductionEnv(env)) return true;
  return parseBoolean(env.PLANNING_AUTH_REQUIRED, defaultPlanningAuthRequired());
}

function isTrustedAuthHeaderEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseBoolean(env.PLANNING_TRUST_AUTH_HEADERS, false);
}

function readTrustedHeaderUserId(request: Request | undefined): string {
  if (!request) return "";
  return request.headers.get("x-planning-user-id")?.trim()
    || request.headers.get("x-auth-user-id")?.trim()
    || "";
}

function hasAuthRuntimeSecret(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean((env.AUTH_SECRET ?? env.NEXTAUTH_SECRET ?? "").trim());
}

function desktopSessionForbiddenMessage(code: string): string {
  if (code === "HOST_FORBIDDEN") return "데스크톱 앱은 127.0.0.1 호스트에서만 사용할 수 있습니다.";
  if (code === "FORWARDED_HEADERS_FORBIDDEN") return "데스크톱 앱은 전달 프록시 헤더가 있는 요청을 허용하지 않습니다.";
  if (code === "RAW_IDENTITY_HEADERS_FORBIDDEN") return "데스크톱 앱은 원시 사용자 식별 헤더를 허용하지 않습니다.";
  return "데스크톱 로컬 요청을 신뢰할 수 없습니다.";
}

async function readAuthSessionUserId(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  if (!hasAuthRuntimeSecret(env)) return "";
  try {
    const authModule = await import("@/auth");
    const session = await authModule.auth();
    const user = session?.user as { id?: unknown } | undefined;
    return typeof user?.id === "string" ? user.id.trim() : "";
  } catch {
    return "";
  }
}

export async function requireCurrentPlanningUser(
  request?: Request,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PlanningCurrentUser> {
  const authRequired = isPlanningAuthRequired(env);
  try {
    assertPlanningStorageMode(env, { authRequired });
  } catch (error) {
    if (error instanceof PlanningStorageModeError) {
      throw new PlanningAuthError(error.code, error.message, error.status);
    }
    throw error;
  }

  if (isDesktopLocalDeploymentRequested(env)) {
    const desktopSession = evaluateDesktopSessionRequest(request, env);
    if (desktopSession.ok) {
      return {
        id: DEFAULT_PLANNING_USER_ID,
        source: "desktop-local-session",
        authRequired: true,
      };
    }
    if (desktopSession.code === "DEPLOYMENT_NOT_READY") {
      throw new PlanningAuthError(
        "DEPLOYMENT_NOT_READY",
        "데스크톱 로컬 실행 환경을 확인할 수 없습니다. 앱을 종료한 뒤 공식 실행 아이콘으로 다시 시작해 주세요.",
        503,
        "desktop-launcher",
      );
    }
    if (desktopSession.code === "SESSION_REQUIRED") {
      throw new PlanningAuthError(
        "UNAUTHENTICATED",
        "데스크톱 세션을 확인하지 못했습니다. 앱 실행 아이콘이나 시작 명령으로 다시 열어 주세요.",
        401,
        "desktop-launcher",
      );
    }
    throw new PlanningAuthError(
      "FORBIDDEN",
      desktopSessionForbiddenMessage(desktopSession.code),
      403,
      "desktop-launcher",
    );
  }
  const trustedHeaderUserId = readTrustedHeaderUserId(request);

  if (trustedHeaderUserId) {
    if (!isTrustedAuthHeaderEnabled(env)) {
      throw new PlanningAuthError(
        "FORBIDDEN",
        "신뢰된 인증 헤더가 비활성화되어 있습니다.",
        403,
      );
    }
    if (!request || !isLocalRequest(request, env)) {
      throw new PlanningAuthError(
        "FORBIDDEN",
        "신뢰된 인증 헤더는 로컬 또는 내부 프록시 요청에서만 사용할 수 있습니다.",
        403,
      );
    }
    return {
      id: resolvePlanningUserId(trustedHeaderUserId, env),
      source: "trusted-header",
      authRequired,
    };
  }

  const authSessionUserId = await readAuthSessionUserId(env);
  if (authSessionUserId) {
    return {
      id: resolvePlanningUserId(authSessionUserId, env),
      source: "auth-session",
      authRequired,
    };
  }

  if (authRequired) {
    throw new PlanningAuthError(
      "UNAUTHENTICATED",
      "로그인이 필요합니다.",
      401,
    );
  }

  return {
    id: resolvePlanningUserId(DEFAULT_PLANNING_USER_ID, env),
    source: "local-namespace",
    authRequired,
  };
}

export async function withCurrentPlanningUser<T>(
  request: Request,
  callback: (user: PlanningCurrentUser) => T | Promise<T>,
): Promise<T> {
  const user = await requireCurrentPlanningUser(request);
  return runWithPlanningUserScope({ userId: user.id, authSource: user.source }, () => callback(user));
}

export function isPlanningAuthError(error: unknown): error is PlanningAuthError {
  return error instanceof PlanningAuthError;
}
