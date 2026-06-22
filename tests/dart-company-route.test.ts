import { afterEach, describe, expect, it } from "vitest";
import { GET as companyGET } from "../src/app/api/public/disclosure/company/route";
import {
  isValidCorpCode,
  normalizeCorpCode,
  toDartCompanyRouteData,
} from "../src/lib/publicApis/dart/companyRoute";

describe("disclosure company route", () => {
  const originalFixture = process.env.DART_E2E_FIXTURE;

  afterEach(() => {
    if (typeof originalFixture === "string") {
      process.env.DART_E2E_FIXTURE = originalFixture;
    } else {
      delete process.env.DART_E2E_FIXTURE;
    }
  });

  it("rejects invalid corpCode formats before calling upstream", async () => {
    const response = await companyGET(new Request("http://localhost/api/public/disclosure/company?corpCode=bad-code"));
    const payload = await response.json() as { ok?: boolean; error?: { code?: string; message?: string } };

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("INPUT");
    expect(payload.error?.message).toContain("corpCode 형식");
  });

  it("normalizes and validates corpCode before route work", () => {
    expect(normalizeCorpCode(" 00126380 ")).toBe("00126380");
    expect(isValidCorpCode("00126380")).toBe(true);
    expect(isValidCorpCode("bad-code")).toBe(false);
  });

  it("serves fixture data when the corpCode format is valid", async () => {
    process.env.DART_E2E_FIXTURE = "1";

    const response = await companyGET(new Request("http://localhost/api/public/disclosure/company?corpCode=00126380"));
    const payload = await response.json() as {
      ok?: boolean;
      data?: { corpCode?: string; corpName?: string };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.corpCode).toBe("00126380");
    expect(payload.data?.corpName).toBe("삼성전자");
  });

  it("maps OpenDART company payloads to the public route data shape", () => {
    const data = toDartCompanyRouteData({
      corp_code: "00126380",
      corp_name: "삼성전자",
      stock_code: "005930",
      induty_code: "264",
      ceo_nm: "한종희",
      hm_url: "https://www.samsung.com/sec/",
      adres: "경기도 수원시",
      raw: { status: "000" },
    }, new Date("2026-06-23T00:00:00.000Z"));

    expect(data).toEqual({
      corpCode: "00126380",
      corpName: "삼성전자",
      stockCode: "005930",
      industry: "264",
      ceo: "한종희",
      homepage: "https://www.samsung.com/sec/",
      address: "경기도 수원시",
      source: "금융감독원 전자공시(OpenDART)",
      fetchedAt: "2026-06-23T00:00:00.000Z",
    });
  });
});
