import { NextResponse } from "next/server";
import { getDartCompany } from "@/lib/publicApis/dart/company";
import {
  isValidCorpCode,
  loadFixtureDartCompanyRouteData,
  normalizeCorpCode,
  toDartCompanyRouteData,
} from "@/lib/publicApis/dart/companyRoute";
import { mapDartErrorToHttp, toPublicDartError } from "@/lib/publicApis/dart/opendartErrors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const corpCode = normalizeCorpCode(searchParams.get("corpCode"));

  if (!corpCode) {
    return NextResponse.json({ ok: false, error: { code: "INPUT", message: "corpCode를 입력하세요." } }, { status: 400 });
  }
  if (!isValidCorpCode(corpCode)) {
    return NextResponse.json({ ok: false, error: { code: "INPUT", message: "corpCode 형식이 올바르지 않습니다." } }, { status: 400 });
  }

  if ((process.env.DART_E2E_FIXTURE ?? "").trim() === "1") {
    try {
      return NextResponse.json({
        ok: true,
        data: loadFixtureDartCompanyRouteData(),
      });
    } catch {
      return NextResponse.json(
        { ok: false, error: { code: "FIXTURE", message: "회사 상세 fixture를 읽지 못했습니다." } },
        { status: 500 },
      );
    }
  }

  const result = await getDartCompany(corpCode, request.signal);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: toPublicDartError(result.error) },
      { status: mapDartErrorToHttp(result.error) },
    );
  }

  return NextResponse.json({
    ok: true,
    data: toDartCompanyRouteData(result.data),
  });
}
