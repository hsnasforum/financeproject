import { describe, expect, it } from "vitest";
import { parseFinlifeApiResponse } from "../src/lib/finlife/apiSchema";

describe("parseFinlifeApiResponse", () => {
  it("parses valid finlife api shape and keeps product options", () => {
    const parsed = parseFinlifeApiResponse({
      ok: true,
      mode: "mock",
      meta: {
        kind: "deposit",
        pageNo: 1,
        topFinGrpNo: "020000",
        fallbackUsed: false,
      },
      data: [
        {
          fin_prdt_cd: "D001",
          fin_prdt_nm: "테스트 예금",
          kor_co_nm: "테스트은행",
          raw: {},
          best: { save_trm: "12", intr_rate: 3.1, intr_rate2: 3.5 },
          options: [
            { save_trm: "6", intr_rate: 2.8, intr_rate2: 3.0, raw: { intr_rate_type_nm: "단리" } },
            { save_trm: "12", intr_rate: 3.1, intr_rate2: 3.5, raw: { intr_rate_type_nm: "단리" } },
          ],
        },
      ],
    });

    expect(parsed.ok).toBe(true);
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0]?.options).toHaveLength(2);
    expect(parsed.data[0]?.best?.intr_rate2).toBe(3.5);
  });

  it("accepts expanded kind values without forcing deposit", () => {
    const parsed = parseFinlifeApiResponse({
      ok: true,
      mode: "fixture",
      meta: {
        kind: "mortgage-loan",
        pageNo: 1,
        topFinGrpNo: "020000",
        fallbackUsed: false,
      },
      data: [],
    });

    expect(parsed.ok).toBe(true);
    expect(parsed.meta.kind).toBe("mortgage-loan");
  });

  it("keeps failure envelope with meta.kind and data array on error payload", () => {
    const parsed = parseFinlifeApiResponse({
      ok: false,
      mode: "live",
      meta: {
        kind: "deposit",
        pageNo: 1,
        topFinGrpNo: "020000",
        fallbackUsed: false,
      },
      data: [],
      error: {
        code: "SCHEMA_MISMATCH",
        message: "응답 형식이 예상과 다릅니다.",
      },
    });

    expect(parsed.ok).toBe(false);
    expect(parsed.meta.kind).toBe("deposit");
    expect(Array.isArray(parsed.data)).toBe(true);
    expect(parsed.error?.code).toBe("SCHEMA_MISMATCH");
    expect(typeof parsed.error?.message).toBe("string");
  });
});
