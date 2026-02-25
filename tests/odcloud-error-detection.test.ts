import { describe, expect, it } from "vitest";
import { extractOdcloudRows } from "../src/lib/publicApis/odcloudScan";

describe("odcloud error detection", () => {
  it("detects auth-like error hints even when data is empty", () => {
    const result = extractOdcloudRows({
      data: [],
      message: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR",
    });
    expect("error" in result).toBe(true);
    if (!("error" in result)) return;
    expect(result.error.code).toBe("AUTH_FAILED");
  });
});

