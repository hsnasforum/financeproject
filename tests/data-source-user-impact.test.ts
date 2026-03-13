import { describe, expect, it } from "vitest";
import { buildDataSourceExpansionCandidates, buildDataSourceUserImpactCards } from "../src/lib/dataSources/userImpact";

describe("data source user impact cards", () => {
  it("marks product comparison as ready when FINLIFE is configured", () => {
    const cards = buildDataSourceUserImpactCards(["FINLIFE"]);
    const card = cards.find((entry) => entry.id === "products");
    expect(card?.state).toBe("ready");
    expect(card?.basis).toContain("비교용 정보");
    expect(card?.freshness).toContain("공시 시점");
    expect(card?.routes.map((route) => route.href)).toEqual([
      "/products/deposit",
      "/products/saving",
      "/products/credit-loan",
    ]);
  });

  it("marks product comparison as partial when only support source is configured", () => {
    const cards = buildDataSourceUserImpactCards(["DATAGO_KDB"]);
    const card = cards.find((entry) => entry.id === "products");
    expect(card?.state).toBe("partial");
  });

  it("marks OpenDART impact as ready when OPENDART is configured", () => {
    const cards = buildDataSourceUserImpactCards(["OPENDART"]);
    const card = cards.find((entry) => entry.id === "dart");
    expect(card?.state).toBe("ready");
    expect(card?.routes[0]?.href).toBe("/public/dart");
    expect(card?.freshness).toContain("공시 접수");
  });

  it("marks housing as missing when no housing sources are configured", () => {
    const cards = buildDataSourceUserImpactCards([]);
    const card = cards.find((entry) => entry.id === "housing");
    expect(card?.state).toBe("missing");
  });
});

describe("data source expansion candidates", () => {
  it("marks macro expansion as ready when ECOS, KOSIS, FRED are all configured", () => {
    const cards = buildDataSourceExpansionCandidates(["BOK_ECOS", "KOSIS", "FRED"]);
    const card = cards.find((entry) => entry.id === "macro");
    expect(card?.state).toBe("ready");
    expect(card?.sourceIds).toEqual(["BOK_ECOS", "KOSIS", "FRED"]);
    expect(card?.gate).toContain("asOf");
  });

  it("marks retirement expansion as partial when one supporting source is configured", () => {
    const cards = buildDataSourceExpansionCandidates(["NPS"]);
    const card = cards.find((entry) => entry.id === "retirement");
    expect(card?.state).toBe("partial");
  });
});
