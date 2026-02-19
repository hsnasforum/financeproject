import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const corpCode = (searchParams.get("corpCode") ?? "").trim();

  if (!corpCode) {
    return NextResponse.json({ ok: false, error: { code: "INPUT", message: "corpCode를 입력하세요." } }, { status: 400 });
  }

  const url = new URL(request.url);
  url.pathname = "/api/public/dart/company";
  url.search = `?corpCode=${encodeURIComponent(corpCode)}`;

  const res = await fetch(url.toString(), { cache: "no-store" });
  const json = await res.json();

  if (!json?.ok) {
    return NextResponse.json({ ok: false, error: { code: json?.error?.code ?? "UPSTREAM", message: json?.error?.message ?? "기업개황 조회에 실패했습니다." } }, { status: res.status || 502 });
  }

  return NextResponse.json({
    ok: true,
    data: {
      corpCode: json.data.corp_code,
      corpName: json.data.corp_name,
      stockCode: json.data.stock_code,
      industry: json.data.induty_code,
      ceo: json.data.ceo_nm,
      homepage: json.data.hm_url,
      address: json.data.adres,
      source: "금융감독원 전자공시(OpenDART)",
      fetchedAt: new Date().toISOString(),
    },
  });
}
