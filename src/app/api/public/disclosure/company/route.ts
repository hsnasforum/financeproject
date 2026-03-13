import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getDartCompany } from "@/lib/publicApis/dart/company";
import { mapDartErrorToHttp } from "@/lib/publicApis/dart/opendartErrors";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeCorpCode(value: string | null): string {
  return (value ?? "").trim();
}

function isValidCorpCode(value: string): boolean {
  return /^\d{8}$/.test(value);
}

function fixturePath(): string {
  return path.join(process.cwd(), "tests", "fixtures", "dart", "company.sample.json");
}

function loadFixtureCompany() {
  const parsed = JSON.parse(fs.readFileSync(fixturePath(), "utf-8")) as unknown;
  const data = isRecord(parsed) && isRecord(parsed.data) ? parsed.data : parsed;
  if (!isRecord(data)) {
    throw new Error("invalid fixture payload");
  }

  return {
    corpCode: asString(data.corp_code) ?? asString(data.corpCode) ?? "",
    corpName: asString(data.corp_name) ?? asString(data.corpName) ?? "",
    stockCode: asString(data.stock_code) ?? asString(data.stockCode),
    industry: asString(data.induty_code) ?? asString(data.industry),
    ceo: asString(data.ceo_nm) ?? asString(data.ceo),
    homepage: asString(data.hm_url) ?? asString(data.homepage),
    address: asString(data.adres) ?? asString(data.address),
  };
}

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
      const fixture = loadFixtureCompany();
      return NextResponse.json({
        ok: true,
        data: {
          ...fixture,
          source: "OpenDART E2E Fixture",
          fetchedAt: new Date().toISOString(),
        },
      });
    } catch {
      return NextResponse.json(
        { ok: false, error: { code: "FIXTURE", message: "회사 상세 fixture를 읽지 못했습니다." } },
        { status: 500 },
      );
    }
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
