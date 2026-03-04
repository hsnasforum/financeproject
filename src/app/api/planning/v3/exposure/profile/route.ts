import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCsrf,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import {
  readExposureProfile,
  saveExposureProfile,
} from "../../../../../../../planning/v3/exposure/store";
import { ExposureProfileSchema } from "../../../../../../../planning/v3/exposure/contracts";
import { parseWithV3Whitelist } from "../../../../../../../planning/v3/security/whitelist";

const ExposureGetResponseSchema = z.object({
  ok: z.literal(true),
  profile: ExposureProfileSchema.nullable(),
});

const ExposurePostResponseSchema = z.object({
  ok: z.literal(true),
  profile: ExposureProfileSchema,
});

function withReadGuard(request: Request): Response | null {
  try {
    assertLocalHost(request);
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "요청 검증 중 오류가 발생했습니다." } },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: guard.code, message: guard.message } },
      { status: guard.status },
    );
  }
}

function withWriteGuard(request: Request, body: unknown): Response | null {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertCsrf(request, body as { csrf?: unknown } | null);
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "요청 검증 중 오류가 발생했습니다." } },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: guard.code, message: guard.message } },
      { status: guard.status },
    );
  }
}

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  const payload = parseWithV3Whitelist(ExposureGetResponseSchema, {
    ok: true,
    profile: readExposureProfile(),
  }, { scope: "response", context: "api.v3.exposure.get" });
  return NextResponse.json(payload);
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const guarded = withWriteGuard(request, body);
  if (guarded) return guarded;

  try {
    const payload = body as { profile?: unknown } | null;
    const saved = saveExposureProfile(payload?.profile ?? {});
    const responsePayload = parseWithV3Whitelist(ExposurePostResponseSchema, {
      ok: true,
      profile: saved,
    }, { scope: "response", context: "api.v3.exposure.post" });
    return NextResponse.json(responsePayload);
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "노출 프로필 입력 형식이 올바르지 않습니다." } },
      { status: 400 },
    );
  }
}
