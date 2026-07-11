import { describe, expect, it, vi } from "vitest";
import {
  resolvePlanningRunIdempotency,
  withPlanningRunIdempotency,
} from "../../src/lib/planning/server/runs/createRunIdempotency";

const BODY = {
  profileId: "profile-1",
  title: "baseline",
  input: {
    horizonMonths: 36,
    policyId: "balanced",
  },
};

describe("planning run idempotency", () => {
  it("derives a user-scoped run id and ignores csrf in the request fingerprint", () => {
    const first = resolvePlanningRunIdempotency({
      body: { ...BODY, csrf: "csrf-a" },
      key: "run-request-1234",
      userId: "user-a",
    });
    const sameRequest = resolvePlanningRunIdempotency({
      body: { ...BODY, csrf: "csrf-b" },
      key: "run-request-1234",
      userId: "user-a",
    });
    const otherUser = resolvePlanningRunIdempotency({
      body: BODY,
      key: "run-request-1234",
      userId: "user-b",
    });

    expect(first.ok).toBe(true);
    expect(sameRequest.ok).toBe(true);
    expect(otherUser.ok).toBe(true);
    if (!first.ok || !sameRequest.ok || !otherUser.ok) return;

    expect(first.context?.runId).toBe(sameRequest.context?.runId);
    expect(first.context?.requestFingerprint).toBe(sameRequest.context?.requestFingerprint);
    expect(first.context?.keyHash).toBe(otherUser.context?.keyHash);
    expect(first.context?.runId).not.toBe(otherUser.context?.runId);
    expect(first.context?.lockKey).not.toBe(otherUser.context?.lockKey);
  });

  it("rejects malformed keys and keeps missing keys backward compatible", () => {
    expect(resolvePlanningRunIdempotency({
      body: BODY,
      key: null,
      userId: "user-a",
    })).toEqual({ ok: true, context: null });

    expect(resolvePlanningRunIdempotency({
      body: BODY,
      key: "short",
      userId: "user-a",
    })).toMatchObject({
      ok: false,
      code: "IDEMPOTENCY_KEY_INVALID",
    });
  });

  it("shares one in-flight execution only for the same request fingerprint", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const execute = vi.fn(async () => {
      await gate;
      return "created";
    });
    const context = {
      lockKey: "lock-a",
      requestFingerprint: "fingerprint-a",
    };

    const first = withPlanningRunIdempotency(context, execute, () => "conflict");
    const same = withPlanningRunIdempotency(context, execute, () => "conflict");
    const different = withPlanningRunIdempotency(
      { ...context, requestFingerprint: "fingerprint-b" },
      execute,
      () => "conflict",
    );

    await expect(different).resolves.toBe("conflict");
    expect(execute).toHaveBeenCalledTimes(1);
    release?.();
    await expect(Promise.all([first, same])).resolves.toEqual(["created", "created"]);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("releases a failed in-flight execution so the same key can be retried", async () => {
    const context = {
      lockKey: "lock-retry",
      requestFingerprint: "fingerprint-retry",
    };

    await expect(withPlanningRunIdempotency(
      context,
      async () => {
        throw new Error("network boundary failed");
      },
      () => "conflict",
    )).rejects.toThrow("network boundary failed");

    await expect(withPlanningRunIdempotency(
      context,
      async () => "retried",
      () => "conflict",
    )).resolves.toBe("retried");
  });
});
