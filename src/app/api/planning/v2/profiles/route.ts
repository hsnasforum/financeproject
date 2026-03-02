import { append as appendAuditLog } from "../../../../../lib/audit/auditLogStore";
import {
  assertCsrf,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { jsonError, jsonOk } from "../../../../../lib/http/apiResponse";
import {
  createProfile,
  listProfiles,
} from "../../../../../lib/planning/server/store/profileStore";
import { PlanningV2ValidationError } from "../../../../../lib/planning/server/v2/types";
import { loadCanonicalProfile } from "../../../../../lib/planning/v2/loadCanonicalProfile";

type CreateProfileBody = {
  name?: unknown;
  profile?: unknown;
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasCsrfCookie(request: Request): boolean {
  return (request.headers.get("cookie") ?? "").includes("dev_csrf=");
}

function withLocalReadGuard(request: Request) {
  try {
    assertLocalHost(request);
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) return jsonError("INTERNAL", "요청 검증 중 오류가 발생했습니다.");
    return jsonError(guard.code, guard.message, { status: guard.status });
  }
}

function withLocalWriteGuard(request: Request, body: { csrf?: unknown } | null) {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    const csrfToken = typeof body?.csrf === "string" ? body.csrf.trim() : "";
    if (hasCsrfCookie(request)) {
      assertCsrf(request, { csrf: csrfToken });
    }
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) return jsonError("INTERNAL", "요청 검증 중 오류가 발생했습니다.");
    return jsonError(guard.code, guard.message, { status: guard.status });
  }
}

function appendProfileAudit(input: {
  event: "PLANNING_PROFILE_CREATE";
  route: string;
  result: "SUCCESS" | "ERROR";
  recordId?: string | null;
  message: string;
}) {
  try {
    appendAuditLog({
      event: input.event,
      route: input.route,
      summary: `${input.event} ${input.result}: ${input.message}`,
      details: {
        result: input.result,
        recordId: input.recordId ?? null,
        message: input.message,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append planning profile audit", error);
  }
}

function normalizeCanonicalProfile(input: unknown) {
  return loadCanonicalProfile(input);
}

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guardFailure = withLocalReadGuard(request);
  if (guardFailure) return guardFailure;

  try {
    const records = await listProfiles();
    return jsonOk({ data: records });
  } catch (error) {
    const message = error instanceof Error ? error.message : "프로필 목록 조회에 실패했습니다.";
    return jsonError("INTERNAL", message, { status: 500 });
  }
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: CreateProfileBody = null;
  try {
    body = (await request.json()) as CreateProfileBody;
  } catch {
    body = null;
  }

  const guardFailure = withLocalWriteGuard(request, body);
  if (guardFailure) return guardFailure;

  const name = asString(body?.name);
  try {
    const canonical = normalizeCanonicalProfile(body?.profile);
    const created = await createProfile({
      name: name || "기본 프로필",
      profile: canonical.profile,
    });

    appendProfileAudit({
      event: "PLANNING_PROFILE_CREATE",
      route: "/api/planning/v2/profiles",
      result: "SUCCESS",
      recordId: created.id,
      message: "planning profile created",
    });

    return jsonOk({
      data: created,
      meta: {
        normalization: canonical.normalization,
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof PlanningV2ValidationError) {
      const message = error.issues.map((issue) => `${issue.path}: ${issue.message}`).join(", ");
      appendProfileAudit({
        event: "PLANNING_PROFILE_CREATE",
        route: "/api/planning/v2/profiles",
        result: "ERROR",
        message,
      });
      return jsonError("INPUT", "Invalid profile input", {
        issues: error.issues.map((issue) => `${issue.path}: ${issue.message}`),
      });
    }

    const message = error instanceof Error ? error.message : "프로필 생성에 실패했습니다.";
    appendProfileAudit({
      event: "PLANNING_PROFILE_CREATE",
      route: "/api/planning/v2/profiles",
      result: "ERROR",
      message,
    });
    return jsonError("INTERNAL", message, { status: 500 });
  }
}
