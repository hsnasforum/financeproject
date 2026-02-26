import { NextResponse } from "next/server";
import { getDartCompany } from "@/lib/publicApis/dart/company";
import { mapDartErrorToHttp } from "@/lib/publicApis/dart/opendartErrors";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const corpCode = (searchParams.get("corpCode") ?? "").trim();

  if (!corpCode) {
    return NextResponse.json({ ok: false, error: { code: "INPUT", message: "corpCode를 입력하세요." } }, { status: 400 });
  }

  const result = await getDartCompany(corpCode);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: mapDartErrorToHttp(result.error) });
  }

  return NextResponse.json({
    ok: true,
    data: {
      corpCode: result.data.corp_code,
      corpName: result.data.corp_name,
      stockCode: result.data.stock_code,
      industry: result.data.induty_code,
      ceo: result.data.ceo_nm,
      homepage: result.data.hm_url,
      address: result.data.adres,
      source: "금융감독원 전자공시(OpenDART)",
      fetchedAt: new Date().toISOString(),
    },
  });
}
