import {
  assertLocalHost,
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { jsonError } from "@/lib/planning/api/response";
import { getDraft } from "@/lib/planning/v3/drafts/store";
import { buildProfileV2DraftFromV3Draft } from "@/lib/planning/v3/export";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function withLocalReadGuard(request: Request): Response | null {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    const csrf = asString(new URL(request.url).searchParams.get("csrf"));
    requireCsrf(request, { csrf }, { allowWhenCookieMissing: true });
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) return jsonError("INTERNAL", "요청 검증 중 오류가 발생했습니다.");
    return jsonError(guard.code, guard.message, { status: guard.status });
  }
}

export async function GET(request: Request, context: RouteContext) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guardFailure = withLocalReadGuard(request);
  if (guardFailure) return guardFailure;

  try {
    const { id } = await context.params;
    const draft = await getDraft(id);
    if (!draft) return jsonError("NO_DATA", "초안을 찾을 수 없습니다.", { status: 404 });

    const profileDraft = buildProfileV2DraftFromV3Draft(draft);
    return new Response(`${JSON.stringify(profileDraft, null, 2)}\n`, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": "attachment; filename=\"profile-v2-draft.json\"",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid record id") {
      return jsonError("INPUT", "잘못된 요청입니다.", { status: 400 });
    }
    return jsonError("INTERNAL", "ProfileV2 초안 export에 실패했습니다.", { status: 500 });
  }
}

