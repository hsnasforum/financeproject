import { NextResponse } from "next/server";
import {
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { opsErrorResponse } from "@/lib/ops/errorContract";
import { resetAssumptionsOverrides } from "@/lib/planning/assumptions/overridesStorage";
import { getDefaultProfileId } from "@/lib/planning/server/store/profileStore";
import { sanitizeRecordId } from "@/lib/planning/store/paths";

type ResetBody = {
  csrf?: unknown;
  profileId?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeProfileId(value: unknown): string | undefined {
  const raw = asString(value);
  if (!raw) return undefined;
  try {
    return sanitizeRecordId(raw);
  } catch {
    return undefined;
  }
}

async function resolveTargetProfileId(input: unknown): Promise<string | undefined> {
  const candidate = normalizeProfileId(input);
  if (candidate) return candidate;
  const defaultProfileId = await getDefaultProfileId();
  return normalizeProfileId(defaultProfileId);
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: ResetBody = null;
  try {
    body = (await request.json()) as ResetBody;
  } catch {
    body = null;
  }

  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    requireCsrf(request, body);
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return opsErrorResponse({
        code: "INTERNAL",
        message: "요청 검증 중 오류가 발생했습니다.",
        status: 500,
      });
    }
    return opsErrorResponse({
      code: guard.code,
      message: guard.message,
      status: guard.status,
    });
  }

  try {
    const profileId = await resolveTargetProfileId(body?.profileId);
    await resetAssumptionsOverrides(profileId);
    return NextResponse.json({
      ok: true,
      ...(profileId ? { profileId } : {}),
      items: [],
      message: "가정 오버라이드를 초기화했습니다.",
    });
  } catch (error) {
    return opsErrorResponse({
      code: "STORAGE_CORRUPT",
      message: error instanceof Error ? error.message : "오버라이드 초기화에 실패했습니다.",
      status: 500,
    });
  }
}
