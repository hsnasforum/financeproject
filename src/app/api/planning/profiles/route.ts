import {
  assertLocalHost,
  assertSameOrigin,
  hasCsrfCookie,
  requireCsrf,
  toGuardErrorResponse,
} from "../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../lib/dev/onlyDev";
import { jsonError, jsonOk } from "../../../../lib/http/apiResponse";
import {
  createProfile,
  getDefaultProfileId,
  listProfileMetas,
  setDefaultProfile,
} from "../../../../lib/planning/server/store/profileStore";
import { loadCanonicalProfile } from "../../../../lib/planning/v2/loadCanonicalProfile";

type CreateProfileBody = {
  name?: unknown;
  profile?: unknown;
  isDefault?: unknown;
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asBoolean(value: unknown): boolean | undefined {
  if (value === true) return true;
  if (value === false) return false;
  return undefined;
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
    if (hasCsrfCookie(request)) {
      requireCsrf(request, body, { allowWhenCookieMissing: false });
    }
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) return jsonError("INTERNAL", "요청 검증 중 오류가 발생했습니다.");
    return jsonError(guard.code, guard.message, { status: guard.status });
  }
}

function defaultCanonicalProfile() {
  return loadCanonicalProfile({
    monthlyIncomeNet: 0,
    monthlyEssentialExpenses: 0,
    monthlyDiscretionaryExpenses: 0,
    liquidAssets: 0,
    investmentAssets: 0,
    debts: [],
    goals: [],
  }).profile;
}

function toProfileMetaRow(input: {
  profileId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  isDefault: boolean;
}) {
  return {
    profileId: input.profileId,
    name: input.name,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    isDefault: input.isDefault,
  };
}

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guardFailure = withLocalReadGuard(request);
  if (guardFailure) return guardFailure;

  try {
    const [items, defaultProfileId] = await Promise.all([
      listProfileMetas(),
      getDefaultProfileId(),
    ]);
    return jsonOk({
      data: items.map((item) => toProfileMetaRow(item)),
      meta: {
        ...(defaultProfileId ? { defaultProfileId } : {}),
      },
    });
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

  try {
    const canonicalProfile = body?.profile !== undefined
      ? loadCanonicalProfile(body.profile).profile
      : defaultCanonicalProfile();
    const created = await createProfile({
      name: asString(body?.name) || "기본 프로필",
      profile: canonicalProfile,
    });
    const setAsDefault = asBoolean(body?.isDefault) === true;
    if (setAsDefault) {
      await setDefaultProfile(created.id);
    }
    const metas = await listProfileMetas();
    const meta = metas.find((item) => item.profileId === created.id);
    return jsonOk({
      data: meta
        ? toProfileMetaRow(meta)
        : toProfileMetaRow({
          profileId: created.id,
          name: created.name,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
          isDefault: setAsDefault,
        }),
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "프로필 생성에 실패했습니다.";
    return jsonError("INPUT", message, { status: 400 });
  }
}
