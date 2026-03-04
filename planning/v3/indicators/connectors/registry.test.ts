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

  it("throws INPUT when connector is not configured", () => {
    expect(() => getConnector({
      id: "ecos",
      name: "ECOS",
      type: "ecos",
      enabled: true,
    })).toThrow(/connector_not_configured/);
  });
});
