import { describe, expect, it } from "vitest";
import { SIGUNGU_BY_SIDO_CODE_2025, getSidoByCode, getSigunguByCode } from "../src/lib/regions/kr_admin_2025";

describe("kr admin binding", () => {
  it("does not include sido name itself in busan sigungu list", () => {
    const busan = SIGUNGU_BY_SIDO_CODE_2025["26"] ?? [];
    expect(busan.some((entry) => entry.name.includes("부산광역시"))).toBe(false);
    expect(busan.some((entry) => entry.name === "해운대구")).toBe(true);
  });

  it("maps code to name stably", () => {
    expect(getSidoByCode("26")?.name).toBe("부산광역시");
    expect(getSigunguByCode("26", "26350")?.name).toBe("해운대구");
  });
});

