import { describe, expect, it } from "vitest";
import {
  isAllowedFixId,
  isAllowedRuleAction,
  runAllowedFix,
  runAllowedRuleAction,
  runScript,
  sanitizeRunScriptInput,
} from "../src/lib/dev/runScript";

describe("runScript whitelist", () => {
  it("allows only explicit pnpm scripts", () => {
    expect(sanitizeRunScriptInput({ command: "pnpm", args: ["prisma", "db", "push"] })).toEqual({
      command: "pnpm",
      args: ["prisma", "db", "push"],
    });
    expect(sanitizeRunScriptInput({ command: "pnpm", args: ["seed:debug"] })).toEqual({
      command: "pnpm",
      args: ["seed:debug"],
    });
    expect(sanitizeRunScriptInput({ command: "pnpm", args: ["daily:refresh"] })).toEqual({
      command: "pnpm",
      args: ["daily:refresh"],
    });
    expect(sanitizeRunScriptInput({ command: "pnpm", args: ["dart:watch"] })).toEqual({
      command: "pnpm",
      args: ["dart:watch"],
    });
    expect(sanitizeRunScriptInput({ command: "pnpm", args: ["news:refresh"] })).toEqual({
      command: "pnpm",
      args: ["news:refresh"],
    });
    expect(sanitizeRunScriptInput({ command: "pnpm", args: ["data:doctor"] })).toEqual({
      command: "pnpm",
      args: ["data:doctor"],
    });
    expect(sanitizeRunScriptInput({ command: "pnpm", args: ["dart:rules:eval:all"] })).toEqual({
      command: "pnpm",
      args: ["dart:rules:eval:all"],
    });
    expect(sanitizeRunScriptInput({ command: "pnpm", args: ["dart:rules:eval:labeled"] })).toEqual({
      command: "pnpm",
      args: ["dart:rules:eval:labeled"],
    });
    expect(sanitizeRunScriptInput({ command: "pnpm", args: ["dart:rules:suggest"] })).toEqual({
      command: "pnpm",
      args: ["dart:rules:suggest"],
    });
    expect(sanitizeRunScriptInput({ command: "pnpm", args: ["dart:rules:patch:make"] })).toEqual({
      command: "pnpm",
      args: ["dart:rules:patch:make"],
    });
    expect(sanitizeRunScriptInput({ command: "pnpm", args: ["dart:rules:patch:dry"] })).toEqual({
      command: "pnpm",
      args: ["dart:rules:patch:dry"],
    });
    expect(sanitizeRunScriptInput({ command: "pnpm", args: ["dart:rules:patch:apply"] })).toEqual({
      command: "pnpm",
      args: ["dart:rules:patch:apply"],
    });
    expect(sanitizeRunScriptInput({ command: "pnpm", args: ["dart:rules:gate"] })).toEqual({
      command: "pnpm",
      args: ["dart:rules:gate"],
    });
    expect(sanitizeRunScriptInput({
      command: "node",
      args: ["scripts/rules_pr_prepare.mjs", "--scope=both"],
    })).toEqual({
      command: "node",
      args: ["scripts/rules_pr_prepare.mjs", "--scope=both"],
    });
    expect(sanitizeRunScriptInput({
      command: "node",
      args: ["scripts/rules_pr_prepare.mjs", "--scope=rules", "--includeTmpPatch=1"],
    })).toEqual({
      command: "node",
      args: ["scripts/rules_pr_prepare.mjs", "--scope=rules", "--includeTmpPatch=1"],
    });
  });

  it("rejects commands outside whitelist without executing", async () => {
    expect(sanitizeRunScriptInput({ command: "bash", args: ["-lc", "echo test"] })).toBeNull();
    expect(sanitizeRunScriptInput({ command: "pnpm", args: ["dart:watch", "--silent"] })).toBeNull();
    expect(sanitizeRunScriptInput({
      command: "node",
      args: ["scripts/rules_pr_prepare.mjs", "--includeTmpPatch=1"],
    })).toBeNull();
    expect(sanitizeRunScriptInput({
      command: "node",
      args: ["scripts/rules_pr_prepare.mjs", "--scope=both", "--raw=1"],
    })).toBeNull();

    const result = await runScript({ command: "bash", args: ["-lc", "echo test"] });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("NOT_ALLOWED");
    expect(result.tookMs).toBe(0);
    expect(result.stdoutTail).toBe("");
    expect(result.stderrTail).toBe("");
  });

  it("validates allowed fix ids and blocks unknown fix ids", async () => {
    expect(isAllowedFixId("SEED_DEBUG")).toBe(true);
    expect(isAllowedFixId("UNKNOWN_FIX")).toBe(false);

    const result = await runAllowedFix("UNKNOWN_FIX");
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("NOT_ALLOWED");
  });

  it("validates allowed rule actions and blocks unknown actions", async () => {
    expect(isAllowedRuleAction("PR_PREPARE_RULES")).toBe(true);
    expect(isAllowedRuleAction("UNKNOWN_ACTION")).toBe(false);

    const result = await runAllowedRuleAction("UNKNOWN_ACTION");
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("NOT_ALLOWED");
  });
});
