import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  formatWindowsBridgeFailureReason,
  isWindowsPowerShellAvailable,
  parseBridgeAddressList,
  parseWindowsBridgeStatusLine,
} from "../scripts/next_dev_safe.mjs";

function makeSpawnResult(status: number | null, error?: Error): SpawnSyncReturns<string> {
  return {
    pid: 1,
    output: [],
    stdout: "",
    stderr: "",
    status,
    signal: null,
    error,
  };
}

function makeRunner(result: SpawnSyncReturns<string>): typeof spawnSync {
  return (() => result) as unknown as typeof spawnSync;
}

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

  it("detects whether Windows PowerShell can be launched", () => {
    expect(
      isWindowsPowerShellAvailable(makeRunner(makeSpawnResult(0))),
    ).toBe(true);
    expect(
      isWindowsPowerShellAvailable(makeRunner(makeSpawnResult(null, new Error("spawn powershell.exe ENOENT")))),
    ).toBe(false);
    expect(
      isWindowsPowerShellAvailable(makeRunner(makeSpawnResult(1))),
    ).toBe(false);
  });
});
