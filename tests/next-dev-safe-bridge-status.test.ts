import { describe, expect, it } from "vitest";
import {
  formatWindowsBridgeFailureReason,
  parseBridgeAddressList,
  parseWindowsBridgeStatusLine,
} from "../scripts/next_dev_safe.mjs";

describe("next_dev_safe windows bridge status", () => {
  it("parses ready status line with listener and warning lists", () => {
    expect(
      parseWindowsBridgeStatusLine("STATUS READY started=127.0.0.1:3100 warnings=-"),
    ).toEqual({
      status: "READY",
      listeners: ["127.0.0.1:3100"],
      warnings: [],
    });
  });

  it("parses fail status line with warning listeners", () => {
    expect(
      parseWindowsBridgeStatusLine("STATUS FAIL started=- warnings=127.0.0.1:3100"),
    ).toEqual({
      status: "FAIL",
      listeners: [],
      warnings: ["127.0.0.1:3100"],
    });
  });

  it("formats failure reason from warning listeners", () => {
    expect(
      formatWindowsBridgeFailureReason({
        status: "FAIL",
        listeners: parseBridgeAddressList("-"),
        warnings: parseBridgeAddressList("127.0.0.1:3100"),
      }),
    ).toBe("listen failed (127.0.0.1:3100)");
  });
});
