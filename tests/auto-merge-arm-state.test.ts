import { describe, expect, it } from "vitest";
import {
  computeNextPollInterval,
  parseArmPersistPayload,
  pruneArmedState,
  type AutoMergeArmPersistPayload,
} from "../src/lib/github/autoMergeArmState";

describe("auto merge arm state helpers", () => {
  it("parses session payload and ignores invalid rows", () => {
    const payload: AutoMergeArmPersistPayload = {
      version: 1,
      armed: {
        "101": {
          expectedHeadSha: "abc123",
          confirmText: "MERGE 101 abc123",
          armedAt: "2026-02-27T00:00:00.000Z",
          lastReasonCode: "CHECKS_PENDING",
        },
        "0": {
          expectedHeadSha: "ignored",
          confirmText: "ignored",
          armedAt: "2026-02-27T00:00:00.000Z",
        },
        invalid: {
          expectedHeadSha: "ignored",
          confirmText: "",
          armedAt: "",
        },
      },
    };

    const parsed = parseArmPersistPayload(JSON.stringify(payload));
    expect(parsed.version).toBe(1);
    expect(Object.keys(parsed.armed)).toEqual(["101"]);
    expect(parsed.armed["101"]?.lastReasonCode).toBe("CHECKS_PENDING");
  });

  it("prunes missing PR and SHA mismatch entries", () => {
    const pruned = pruneArmedState(
      {
        "101": {
          expectedHeadSha: "sha-1",
          confirmText: "MERGE 101 sha-1",
          armedAt: "2026-02-27T00:00:00.000Z",
        },
        "102": {
          expectedHeadSha: "sha-old",
          confirmText: "MERGE 102 sha-old",
          armedAt: "2026-02-27T00:00:00.000Z",
        },
        "103": {
          expectedHeadSha: "sha-3",
          confirmText: "MERGE 103 sha-3",
          armedAt: "2026-02-27T00:00:00.000Z",
        },
      },
      [
        { number: 101, headSha: "sha-1" },
        { number: 102, headSha: "sha-new" },
      ],
    );

    expect(Object.keys(pruned.armed)).toEqual(["101"]);
    expect(pruned.removedShaMismatch).toEqual([102]);
    expect(pruned.removedMissing).toEqual([103]);
  });

  it("computes poll interval by reason code and backoff", () => {
    expect(computeNextPollInterval({ reasonCode: "CHECKS_PENDING" }).intervalMs).toBe(10_000);
    expect(computeNextPollInterval({ reasonCode: "CHECKS_FAIL" }).intervalMs).toBe(60_000);
    expect(computeNextPollInterval({ reasonCode: "ELIGIBLE" }).intervalMs).toBe(15_000);

    const firstError = computeNextPollInterval({ requestError: true, previousBackoffMs: 0 });
    const secondError = computeNextPollInterval({ requestError: true, previousBackoffMs: firstError.nextBackoffMs });
    const thirdError = computeNextPollInterval({ requestError: true, previousBackoffMs: secondError.nextBackoffMs });
    const fourthError = computeNextPollInterval({ requestError: true, previousBackoffMs: 120_000 });

    expect(firstError.intervalMs).toBe(15_000);
    expect(secondError.intervalMs).toBe(30_000);
    expect(thirdError.intervalMs).toBe(60_000);
    expect(fourthError.intervalMs).toBe(120_000);
  });
});
