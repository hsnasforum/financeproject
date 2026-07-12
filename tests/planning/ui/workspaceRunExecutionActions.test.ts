import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  postPlanningRun,
  resolvePlanningRunIdempotencyRequest,
  shouldReleasePendingPlanningRunRequest,
} from "../../../src/components/planning/workspace/useWorkspaceRunExecutionActions";

describe("workspace planning run execution", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reuses the same idempotency key and request body for one network retry", async () => {
    const response = new Response(JSON.stringify({ ok: true }), { status: 201 });
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("connection reset"))
      .mockResolvedValueOnce(response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(postPlanningRun(
      { profileId: "profile-1", input: { horizonMonths: 12 } },
      "planning-run-client-retry-0001",
    )).resolves.toBe(response);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const secondInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(firstInit.body).toBe(secondInit.body);
    expect(firstInit.headers).toEqual(secondInit.headers);
    expect(firstInit.headers).toMatchObject({
      "idempotency-key": "planning-run-client-retry-0001",
    });
  });

  it("keeps an ambiguous network failure key for the next identical user retry", () => {
    const createKey = vi.fn()
      .mockReturnValueOnce("planning-run-client-retry-0001")
      .mockReturnValueOnce("planning-run-client-retry-0002");
    const body = { profileId: "profile-1", input: { horizonMonths: 12 } };

    const first = resolvePlanningRunIdempotencyRequest({ body, pending: null, createKey });
    const sameRequestRetry = resolvePlanningRunIdempotencyRequest({
      body: { profileId: "profile-1", input: { horizonMonths: 12 } },
      pending: first,
      createKey,
    });
    const changedRequest = resolvePlanningRunIdempotencyRequest({
      body: { profileId: "profile-1", input: { horizonMonths: 24 } },
      pending: sameRequestRetry,
      createKey,
    });

    expect(sameRequestRetry).toBe(first);
    expect(changedRequest.idempotencyKey).toBe("planning-run-client-retry-0002");
    expect(createKey).toHaveBeenCalledTimes(2);
  });

  it("keeps successful creates pending through terminal polling and releases deterministic errors", () => {
    expect(shouldReleasePendingPlanningRunRequest(
      { ok: true, status: 201 },
      { ok: true, data: { id: "run-1" } },
    )).toBe(false);
    expect(shouldReleasePendingPlanningRunRequest(
      { ok: false, status: 400 },
      { ok: false, error: { code: "INPUT", message: "invalid" } },
    )).toBe(true);
    expect(shouldReleasePendingPlanningRunRequest(
      { ok: false, status: 502 },
      { ok: false, error: { code: "UPSTREAM", message: "bad gateway" } },
    )).toBe(false);
    expect(shouldReleasePendingPlanningRunRequest(
      { ok: false, status: 429 },
      { ok: false, error: { code: "RATE_LIMITED", message: "retry" } },
    )).toBe(false);
    expect(shouldReleasePendingPlanningRunRequest(
      { ok: true, status: 201 },
      null,
    )).toBe(false);
  });

  it("keeps the workspace on the canonical create route without duplicate save actions", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/planning/workspace/useWorkspaceRunExecutionActions.ts"),
      "utf-8",
    );
    const panelSource = fs.readFileSync(
      path.join(process.cwd(), "src/components/planning/workspace/panels/executionPanel.tsx"),
      "utf-8",
    );
    const stateSource = fs.readFileSync(
      path.join(process.cwd(), "src/components/planning/workspace/useWorkspaceRuntimeStateBundle.ts"),
      "utf-8",
    );

    expect(source).toContain('fetch("/api/planning/v2/runs"');
    expect(source).not.toContain('fetch("/api/planning/run"');
    expect(source).not.toContain("persistRunAction");
    expect(source).not.toContain("saveRunAction");
    expect(source).toContain("runActionPromiseRef");
    expect(panelSource).not.toContain("실행 성공 시 실행 기록 자동 저장");
    expect(panelSource).not.toContain("결과 저장");
    expect(stateSource).not.toContain("autoSaveRunAfterSuccess");
    expect(stateSource).not.toContain("savingRun");
  });
});
