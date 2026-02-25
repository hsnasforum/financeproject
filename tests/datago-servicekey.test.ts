import { describe, expect, it } from "vitest";
import { buildDatagoUrl, getServiceKeyForSource } from "../src/lib/sources/datago/client";

describe("datago service key resolution", () => {
  it("uses source-specific key first and fallback second", () => {
    const prevKdb = process.env.KDB_DATAGO_SERVICE_KEY;
    const prevCommon = process.env.DATAGO_SERVICE_KEY;

    process.env.KDB_DATAGO_SERVICE_KEY = "kdb raw key";
    process.env.DATAGO_SERVICE_KEY = "common raw key";
    expect(getServiceKeyForSource("datago_kdb")).toBe(encodeURIComponent("kdb raw key"));

    delete process.env.KDB_DATAGO_SERVICE_KEY;
    expect(getServiceKeyForSource("datago_kdb")).toBe(encodeURIComponent("common raw key"));

    if (typeof prevKdb === "string") process.env.KDB_DATAGO_SERVICE_KEY = prevKdb;
    else delete process.env.KDB_DATAGO_SERVICE_KEY;
    if (typeof prevCommon === "string") process.env.DATAGO_SERVICE_KEY = prevCommon;
    else delete process.env.DATAGO_SERVICE_KEY;
  });

  it("does not double-encode an already encoded key in URL", () => {
    const prevKdb = process.env.KDB_DATAGO_SERVICE_KEY;
    const prevCommon = process.env.DATAGO_SERVICE_KEY;

    process.env.KDB_DATAGO_SERVICE_KEY = "abc%2Fdef%3D";
    delete process.env.DATAGO_SERVICE_KEY;

    const url = buildDatagoUrl("datago_kdb", "http://example.com/path", { pageNo: 1, numOfRows: 10 });
    expect(url).toContain("ServiceKey=abc%2Fdef%3D");
    expect(url).not.toContain("ServiceKey=abc%252Fdef%253D");

    if (typeof prevKdb === "string") process.env.KDB_DATAGO_SERVICE_KEY = prevKdb;
    else delete process.env.KDB_DATAGO_SERVICE_KEY;
    if (typeof prevCommon === "string") process.env.DATAGO_SERVICE_KEY = prevCommon;
    else delete process.env.DATAGO_SERVICE_KEY;
  });
});
