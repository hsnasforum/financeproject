import { describe, expect, it } from "vitest";
import { pnpmCommandCandidates, runPnpmSync } from "../scripts/pnpm_runner.mjs";

describe("pnpm runner", () => {
  it("prefers pnpm and keeps corepack as the fallback command", () => {
    expect(pnpmCommandCandidates("linux")).toEqual([
      { command: "pnpm", args: [] },
      { command: "corepack", args: ["pnpm"] },
    ]);
    expect(pnpmCommandCandidates("win32")).toEqual([
      { command: "pnpm.cmd", args: [] },
      { command: "corepack.cmd", args: ["pnpm"] },
    ]);
  });

  it("falls back to corepack pnpm when the direct pnpm shim is missing", () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const enoent = Object.assign(new Error("spawn pnpm ENOENT"), { code: "ENOENT" });
    const runner = ((command: string, args: string[] = []) => {
      calls.push({ command, args });
      if (calls.length === 1) {
        return { status: null, signal: null, error: enoent, stdout: null, stderr: null, output: null, pid: 0 };
      }
      return { status: 0, signal: null, error: undefined, stdout: null, stderr: null, output: null, pid: 0 };
    }) as unknown as typeof import("node:child_process").spawnSync;

    const result = runPnpmSync(["test"], {}, runner);

    expect(result.status).toBe(0);
    expect(calls).toEqual([
      { command: "pnpm", args: ["test"] },
      { command: "corepack", args: ["pnpm", "test"] },
    ]);
  });
});
