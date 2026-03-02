import { NextResponse } from "next/server";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { opsErrorResponse } from "@/lib/ops/errorContract";
import {
  AssumptionsOverrideEntrySchema,
  normalizeAssumptionsOverrides,
  type AssumptionsOverrideEntry,
} from "@/lib/planning/assumptions/overrides";
import {
  loadAssumptionsOverridesByProfile,
  loadAssumptionsOverrides,
  resetAssumptionsOverrides,
  saveAssumptionsOverrides,
} from "@/lib/planning/assumptions/overridesStorage";
import { getDefaultProfileId } from "@/lib/planning/server/store/profileStore";
import { sanitizeRecordId } from "@/lib/planning/store/paths";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

type OverridesMutationBody = {
  csrf?: unknown;
  items?: unknown;
  item?: unknown;
  key?: unknown;
  value?: unknown;
  reason?: unknown;
  updatedAt?: unknown;
  profileId?: unknown;
} | null;

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

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const csrf = asString(searchParams.get("csrf"));
  const requestedProfileId = searchParams.get("profileId");

  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    assertCsrf(request, { csrf });
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
    const profileId = await resolveTargetProfileId(requestedProfileId);
    const items = profileId
      ? await loadAssumptionsOverridesByProfile(profileId)
      : await loadAssumptionsOverrides();
    return NextResponse.json({
      ok: true,
      ...(profileId ? { profileId } : {}),
      items,
    });
  } catch (error) {
    return opsErrorResponse({
      code: "STORAGE_CORRUPT",
      message: error instanceof Error ? error.message : "오버라이드 조회에 실패했습니다.",
      status: 500,
    });
  }
}

export async function POST(request: Request) {
  // Legacy alias: POST behaves the same as PUT (replace list).
  return PUT(request);
}

export async function PUT(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: OverridesMutationBody = null;
  try {
    body = (await request.json()) as OverridesMutationBody;
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
    const items = await saveAssumptionsOverrides(body?.items, profileId);
    return NextResponse.json({
      ok: true,
      ...(profileId ? { profileId } : {}),
      items,
      message: "가정 오버라이드를 저장했습니다.",
    });
  } catch (error) {
    return opsErrorResponse({
      code: "VALIDATION",
      message: error instanceof Error ? error.message : "오버라이드 저장에 실패했습니다.",
      status: 400,
    });
  }
}

function parsePatchItem(body: OverridesMutationBody): AssumptionsOverrideEntry | null {
  if (!body) return null;
  const fromItem = AssumptionsOverrideEntrySchema.safeParse(body.item);
  if (fromItem.success) {
    const [normalized] = normalizeAssumptionsOverrides([fromItem.data]);
    return normalized ?? null;
  }
  const partial = AssumptionsOverrideEntrySchema.safeParse({
    key: body.key,
    value: body.value,
    reason: body.reason,
    updatedAt: body.updatedAt,
  });
  if (!partial.success) return null;
  const [normalized] = normalizeAssumptionsOverrides([partial.data]);
  return normalized ?? null;
}

export async function PATCH(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: OverridesMutationBody = null;
  try {
    body = (await request.json()) as OverridesMutationBody;
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
    const patchItem = parsePatchItem(body);
    if (!patchItem) {
      return opsErrorResponse({
        code: "VALIDATION",
        message: "key/value(%) 기반 오버라이드 항목이 필요합니다.",
        status: 400,
      });
    }
    const currentItems = profileId
      ? await loadAssumptionsOverridesByProfile(profileId)
      : await loadAssumptionsOverrides();
    const nextItems = normalizeAssumptionsOverrides([...currentItems, patchItem]);
    const items = await saveAssumptionsOverrides(nextItems, profileId);
    return NextResponse.json({
      ok: true,
      ...(profileId ? { profileId } : {}),
      items,
      message: "가정 오버라이드를 업데이트했습니다.",
    });
  } catch (error) {
    return opsErrorResponse({
      code: "VALIDATION",
      message: error instanceof Error ? error.message : "오버라이드 업데이트에 실패했습니다.",
      status: 400,
    });
  }
}

export async function DELETE(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: OverridesMutationBody = null;
  try {
    body = (await request.json()) as OverridesMutationBody;
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
