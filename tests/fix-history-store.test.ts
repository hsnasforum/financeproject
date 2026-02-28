import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendFixHistory, listFixHistory } from "../src/lib/diagnostics/fixHistoryStore";

const TEST_STORE_PATH = path.join(process.cwd(), "tmp", "fix_history.test.json");

let previousStorePath: string | undefined;

function cleanup() {
  if (fs.existsSync(TEST_STORE_PATH)) {
    fs.unlinkSync(TEST_STORE_PATH);
  }
}

describe("fix history store", () => {
  beforeEach(() => {
    previousStorePath = process.env.FIX_HISTORY_PATH;
    process.env.FIX_HISTORY_PATH = TEST_STORE_PATH;
    cleanup();
  });

  afterEach(() => {
    cleanup();
    if (typeof previousStorePath === "string") process.env.FIX_HISTORY_PATH = previousStorePath;
    else delete process.env.FIX_HISTORY_PATH;
  });

  it("appends entries and lists in recent-first order", () => {
    const one = appendFixHistory({
      fixId: "SEED_DEBUG",
      ok: true,
      tookMs: 123,
      stdoutTail: "seed ok",
      stderrTail: "",
    });
    const two = appendFixHistory({
      fixId: "DART_WATCH",
      ok: false,
      tookMs: 456,
      stdoutTail: "",
      stderrTail: "watch failed",
      errorCode: "EXIT_NON_ZERO",
      errorMessage: "exit 1",
      analysis: {
        cause: "MISSING_OPENDART_KEY",
        summary: "OPENDART_API_KEY 설정이 필요합니다.",
        suggestedFixIds: ["DART_WATCH", "DAILY_REFRESH"],
      },
    });

    const rows = listFixHistory(10);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.id).toBe(two.id);
    expect(rows[1]?.id).toBe(one.id);
    expect(rows[0]?.errorCode).toBe("EXIT_NON_ZERO");
    expect(rows[0]?.analysis?.cause).toBe("MISSING_OPENDART_KEY");
    expect(rows[0]?.analysis?.suggestedFixIds).toEqual(["DART_WATCH", "DAILY_REFRESH"]);
  });

  it("applies list limit and caps history at 200 entries", () => {
    for (let i = 0; i < 205; i += 1) {
      appendFixHistory({
        fixId: "DATA_DOCTOR",
        ok: i % 2 === 0,
        tookMs: i,
        stdoutTail: `stdout ${i}`,
        stderrTail: "",
      });
    }

    const limited = listFixHistory(3);
    expect(limited).toHaveLength(3);
    expect(limited[0]?.stdoutTail).toContain("204");
    expect(limited[2]?.stdoutTail).toContain("202");

    const all = listFixHistory(500);
    expect(all).toHaveLength(200);
    expect(all[199]?.stdoutTail).toContain("5");
  });

  it("resets broken json file to empty array", () => {
    fs.mkdirSync(path.dirname(TEST_STORE_PATH), { recursive: true });
    fs.writeFileSync(TEST_STORE_PATH, "{ invalid json", "utf-8");

    const rows = listFixHistory(20);
    expect(rows).toEqual([]);

    const repaired = JSON.parse(fs.readFileSync(TEST_STORE_PATH, "utf-8")) as unknown;
    expect(repaired).toEqual([]);
  });

  it("stores chain metadata and steps", () => {
    appendFixHistory({
      fixId: "CHAIN:FULL_REPAIR",
      chainId: "FULL_REPAIR",
      ok: false,
      tookMs: 1000,
      stdoutTail: "step logs",
      stderrTail: "step error",
      errorCode: "EXIT_NON_ZERO",
      errorMessage: "exit 1",
      steps: [
        {
          fixId: "PRISMA_PUSH",
          ok: true,
          tookMs: 100,
          stdoutTail: "ok",
          stderrTail: "",
          errorCode: null,
          errorMessage: null,
        },
        {
          fixId: "SEED_DEBUG",
          ok: false,
          tookMs: 200,
          stdoutTail: "",
          stderrTail: "failed",
          errorCode: "EXIT_NON_ZERO",
          errorMessage: "exit 1",
        },
      ],
    });

    const rows = listFixHistory(1);
    expect(rows[0]?.chainId).toBe("FULL_REPAIR");
    expect(rows[0]?.steps?.length).toBe(2);
    expect(rows[0]?.steps?.[0]?.fixId).toBe("PRISMA_PUSH");
  });
});
