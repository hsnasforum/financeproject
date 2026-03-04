import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import {
  parseExposureProfileInput,
  readExposureProfile,
  writeExposureProfile,
} from "@/lib/news/exposureStore";

const SaveBodySchema = z.object({
  csrf: z.string().optional(),
  profile: z.unknown(),
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
    assertDevUnlocked(request);
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

  return NextResponse.json({
    ok: true,
    data: readExposureProfile(),
  });
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

  const parsed = SaveBodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "입력 형식이 올바르지 않습니다." } },
      { status: 400 },
    );
  }

  try {
    const profile = parseExposureProfileInput(parsed.data.profile);
    const saved = writeExposureProfile(profile);
    return NextResponse.json({
      ok: true,
      data: saved,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "노출 프로필 입력 형식이 올바르지 않습니다." } },
      { status: 400 },
    );
  }
}
