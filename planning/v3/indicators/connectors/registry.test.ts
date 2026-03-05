import { describe, expect, it } from "vitest";
import { getConnector } from "./registry";

describe("planning v3 indicators connector registry", () => {
  it("returns fixture connector for fixture source", () => {
    const connector = getConnector({
      id: "fixture",
      name: "Fixture",
      type: "fixture",
      enabled: true,
    });

    expect(connector.sourceType).toBe("fixture");
  });

  it("returns fred connector for fred source", () => {
    const connector = getConnector({
      id: "fred_main",
      name: "FRED",
      type: "fred",
      enabled: true,
    });

    expect(connector.sourceType).toBe("fred");
  });

  it("returns ecos connector for ecos source", () => {
    const connector = getConnector({
      id: "ecos_bok",
      name: "ECOS",
      type: "ecos",
      enabled: true,
    });

    expect(connector.sourceType).toBe("ecos");
  });

  it("returns kosis connector for kosis source", () => {
    const connector = getConnector({
      id: "kosis_kr",
      name: "KOSIS",
      type: "kosis",
      enabled: true,
    });

    expect(connector.sourceType).toBe("kosis");
  });

  it("throws INPUT when connector is not configured", () => {
    expect(() => getConnector({
      id: "unknown",
      name: "Unknown",
      type: "unknown" as unknown as "kosis",
      enabled: true,
    })).toThrow(/connector_not_configured/);
  });
});
