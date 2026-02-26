import { describe, expect, it } from "vitest";
import { runScript, sanitizeRunScriptInput } from "../src/lib/dev/runScript";

describe("runScript whitelist", () => {
  it("allows only explicit pnpm scripts", () => {
    expect(sanitizeRunScriptInput({ command: "pnpm", args: ["dart:watch"] })).toEqual({
      command: "pnpm",
      args: ["dart:watch"],
    });
    expect(sanitizeRunScriptInput({ command: "pnpm", args: ["data:doctor"] })).toEqual({
      command: "pnpm",
      args: ["data:doctor"],
    });
  });

  it("rejects commands outside whitelist without executing", async () => {
    expect(sanitizeRunScriptInput({ command: "bash", args: ["-lc", "echo test"] })).toBeNull();
    expect(sanitizeRunScriptInput({ command: "pnpm", args: ["dart:watch", "--silent"] })).toBeNull();

    const result = await runScript({ command: "bash", args: ["-lc", "echo test"] });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("NOT_ALLOWED");
    expect(result.tookMs).toBe(0);
    expect(result.stdoutTail).toBe("");
    expect(result.stderrTail).toBe("");
  });
});
