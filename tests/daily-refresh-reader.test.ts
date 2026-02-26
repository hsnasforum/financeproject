import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readDailyRefreshResult } from "../src/lib/dev/readDailyRefreshResult";

const TEST_RESULT_PATH = path.join(process.cwd(), "tmp", "daily_refresh_result.reader.test.json");

function cleanup() {
  if (fs.existsSync(TEST_RESULT_PATH)) {
    fs.unlinkSync(TEST_RESULT_PATH);
  }
}

describe("daily refresh reader", () => {
  afterEach(() => {
    cleanup();
  });

  it("parses valid result json", () => {
    fs.mkdirSync(path.dirname(TEST_RESULT_PATH), { recursive: true });
    fs.writeFileSync(
      TEST_RESULT_PATH,
      JSON.stringify({
        generatedAt: "2026-02-26T14:00:00.000Z",
        ok: true,
        steps: [
          {
            name: "dart:watch",
            status: "ok",
            tookMs: 1234,
            stdoutTail: "done",
            stderrTail: "",
          },
        ],
      }),
      "utf-8",
    );

    const result = readDailyRefreshResult(TEST_RESULT_PATH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.generatedAt).toBe("2026-02-26T14:00:00.000Z");
    expect(result.data?.ok).toBe(true);
    expect(result.data?.steps).toHaveLength(1);
    expect(result.data?.steps[0]?.name).toBe("dart:watch");
    expect(result.data?.steps[0]?.status).toBe("ok");
  });

  it("returns {ok:true,data:null} when file is missing", () => {
    cleanup();
    const result = readDailyRefreshResult(TEST_RESULT_PATH);
    expect(result).toEqual({ ok: true, data: null });
  });

  it("returns ok:false when json is invalid", () => {
    fs.mkdirSync(path.dirname(TEST_RESULT_PATH), { recursive: true });
    fs.writeFileSync(TEST_RESULT_PATH, "{ invalid json", "utf-8");

    const result = readDailyRefreshResult(TEST_RESULT_PATH);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PARSE_FAILED");
    expect(result.error.message.length).toBeGreaterThan(0);
  });
});
