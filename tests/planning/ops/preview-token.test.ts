import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __PREVIEW_TOKEN_TTL_MS_FOR_TESTS,
  clearOpsActionPreviewTokensForTests,
  consumeOpsActionPreviewToken,
  issueOpsActionPreviewToken,
} from "../../../src/lib/ops/actions/previewToken";

describe("ops action preview token", () => {
  afterEach(() => {
    vi.useRealTimers();
    clearOpsActionPreviewTokensForTests();
  });

  it("expires after ttl", () => {
    vi.useFakeTimers();
    const token = issueOpsActionPreviewToken("REPAIR_INDEX", {});
    vi.advanceTimersByTime(__PREVIEW_TOKEN_TTL_MS_FOR_TESTS + 1);

    const consumed = consumeOpsActionPreviewToken(token, "REPAIR_INDEX", {});
    expect(consumed).toBe(false);
  });
});

