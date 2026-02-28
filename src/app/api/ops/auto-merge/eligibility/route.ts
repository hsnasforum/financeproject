import { NextResponse } from "next/server";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { getAutoMergeEligibility } from "../../../../../lib/github/autoMergeEligibility";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const prNumberRaw = Number(searchParams.get("prNumber") ?? "");
  const expectedHeadSha = asString(searchParams.get("expectedHeadSha"));
  const csrf = asString(searchParams.get("csrf"));

  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    assertCsrf(request, { csrf });
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return NextResponse.json(
        {
          ok: false,
          eligible: false,
          reasonCode: "UNKNOWN",
          reasonMessage: "요청 검증 중 오류가 발생했습니다.",
          expectedConfirm: "",
          headSha: "",
          requiredChecks: [],
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        eligible: false,
        reasonCode: "UNKNOWN",
        reasonMessage: guard.message,
        expectedConfirm: "",
        headSha: "",
        requiredChecks: [],
      },
      { status: guard.status },
    );
  }

  if (!Number.isFinite(prNumberRaw) || prNumberRaw <= 0) {
    return NextResponse.json(
      {
        ok: false,
        eligible: false,
        reasonCode: "UNKNOWN",
        reasonMessage: "prNumber가 필요합니다.",
        expectedConfirm: "",
        headSha: "",
        requiredChecks: [],
      },
      { status: 400 },
    );
  }

  const result = await getAutoMergeEligibility(Math.trunc(prNumberRaw), expectedHeadSha);
  const status = result.ok ? 200 : 502;
  return NextResponse.json(result, { status });
}
