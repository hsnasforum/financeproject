import { describe, expect, it, vi } from "vitest";
import {
  createDraftFromCsvUpload,
} from "../../src/app/planning/v3/drafts/_components/draftsUploadFlow";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

describe("planning v3 drafts one-click upload flow", () => {
  it("creates draft and returns draftId on successful upload", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        draftId: "d_new_1",
        draftSummary: { rows: 2, columns: 3 },
      }));
    const fetchImpl = fetchMock as unknown as FetchLike;

    const created = await createDraftFromCsvUpload(
      "date,amount,description\n2026-01-01,1000,salary",
      fetchImpl,
      "csrf-token",
    );

    expect(created).toEqual({ draftId: "d_new_1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(url).toContain("/api/planning/v3/import/csv");
  });

  it("maps API parse/validation failure to safe user message", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        ok: false,
        error: {
          code: "INPUT",
          message: "date,amount,description\n2026-01-01,1000,SECRET_PII_SHOULD_NOT_LEAK",
        },
      }, 400));
    const fetchImpl = fetchMock as unknown as FetchLike;

    await expect(createDraftFromCsvUpload(
      "date,amount,description\ninvalid,1000,sample",
      fetchImpl,
      "csrf-token",
    )).rejects.toThrow("CSV 형식 또는 값에 문제가 있습니다. 파일 내용을 확인해 주세요.");
  });

  it("rejects empty file before API call", async () => {
    const fetchMock = vi.fn();
    const fetchImpl = fetchMock as unknown as FetchLike;

    await expect(createDraftFromCsvUpload("   ", fetchImpl, "csrf-token"))
      .rejects.toThrow("CSV 파일이 비어 있습니다.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
