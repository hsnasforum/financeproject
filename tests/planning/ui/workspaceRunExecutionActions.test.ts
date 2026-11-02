import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPlanningReportRecord,
  createPlanningRunRecord,
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

function jsonResponse(body: unknown, status = 201): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("wizard run adapter", () => {
  const body = { profileId: "profile-new", input: { horizonMonths: 120 } };
  const wait = vi.fn(async () => undefined);

  afterEach(() => {
    vi.unstubAllGlobals();
    wait.mockClear();
  });

  it("posts once with one idempotency key and returns the terminal record", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      ok: true,
      data: { id: "run-1", overallStatus: "SUCCESS" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createPlanningRunRecord({
      locale: "ko-KR",
      body,
      createKey: () => "wizard-key-0001",
      wait,
    });

    expect(result).toEqual({ status: "ok", record: { id: "run-1", overallStatus: "SUCCESS" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/planning/v2/runs");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "idempotency-key": "wizard-key-0001" });
    expect(init.body).toBe(JSON.stringify(body));
    expect(wait).not.toHaveBeenCalled();
  });

  it("does not resend on a network error, unlike the existing action", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("connection reset"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createPlanningRunRecord({ locale: "ko-KR", body, createKey: () => "k", wait });

    expect(result).toMatchObject({ status: "unknown" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("polls a running record to its terminal state", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { id: "run-1", overallStatus: "RUNNING" } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { id: "run-1", overallStatus: "RUNNING" } }, 200))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { id: "run-1", overallStatus: "PARTIAL_SUCCESS" } }, 200));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createPlanningRunRecord({ locale: "ko-KR", body, createKey: () => "k", wait });

    expect(result).toEqual({ status: "ok", record: { id: "run-1", overallStatus: "PARTIAL_SUCCESS" } });
    expect(wait).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/planning/v2/runs/run-1");
  });

  it("reports a failed run with its id", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      ok: true,
      data: { id: "run-1", overallStatus: "FAILED" },
    })));

    await expect(createPlanningRunRecord({ locale: "ko-KR", body, createKey: () => "k", wait }))
      .resolves.toMatchObject({ status: "failed", recordId: "run-1" });
  });

  it("keeps the id and stays unclear when polling cannot finish", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { id: "run-1", overallStatus: "RUNNING" } }))
      .mockRejectedValueOnce(new TypeError("connection reset")));

    await expect(createPlanningRunRecord({ locale: "ko-KR", body, createKey: () => "k", wait }))
      .resolves.toMatchObject({ status: "unknown", recordId: "run-1" });
  });

  it("stops polling at the attempt limit as unclear", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse({
      ok: true,
      data: { id: "run-1", overallStatus: "RUNNING" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createPlanningRunRecord({ locale: "ko-KR", body, createKey: () => "k", wait, maxPollAttempts: 2 }))
      .resolves.toMatchObject({ status: "unknown", recordId: "run-1" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["a deterministic rejection", 400, { ok: false, error: { code: "INPUT", message: "invalid" } }, "failed"],
    ["a server error", 500, { ok: false, error: { code: "INTERNAL", message: "boom" } }, "unknown"],
    ["an unreadable body", 201, null, "unknown"],
    ["a success with no id", 201, { ok: true, data: {} }, "unknown"],
  ])("classifies %s", async (_name, status, payload, expected) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(
      payload === null ? "<html>" : JSON.stringify(payload),
      { status },
    )));

    await expect(createPlanningRunRecord({ locale: "ko-KR", body, createKey: () => "k", wait }))
      .resolves.toMatchObject({ status: expected });
  });
});

describe("wizard report adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the run id once and returns the record", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ ok: true, data: { id: "report-1" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createPlanningReportRecord({ locale: "ko-KR", runId: "run-1" }))
      .resolves.toEqual({ status: "ok", record: { id: "report-1" } });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/planning/v2/reports");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({ runId: "run-1" });
  });

  it("does not resend on a network error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("connection reset"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createPlanningReportRecord({ locale: "ko-KR", runId: "run-1" }))
      .resolves.toMatchObject({ status: "unknown" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("separates a rejection from an unclear response", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: false, error: { code: "NO_DATA", message: "없음" } }, 404))
      .mockResolvedValueOnce(jsonResponse({ ok: false, error: { code: "INTERNAL", message: "boom" } }, 500)));

    await expect(createPlanningReportRecord({ locale: "ko-KR", runId: "run-1" }))
      .resolves.toMatchObject({ status: "failed" });
    await expect(createPlanningReportRecord({ locale: "ko-KR", runId: "run-1" }))
      .resolves.toMatchObject({ status: "unknown" });
  });
});
