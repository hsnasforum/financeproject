import { describe, expect, it } from "vitest";
import { resolveClientApiError } from "../src/lib/http/clientApiError";

describe("resolveClientApiError", () => {
  it("reads contract error shape and keeps explicit fixHref", () => {
    const parsed = resolveClientApiError({
      ok: false,
      error: {
        code: "LOCKED",
        message: "잠금 상태입니다.",
        fixHref: "/ops/security",
      },
    }, "fallback");

    expect(parsed.code).toBe("LOCKED");
    expect(parsed.message).toBe("잠금 상태입니다.");
    expect(parsed.fixHref).toBe("/ops/security");
  });

  it("supports legacy top-level message/code and infers fixHref", () => {
    const parsed = resolveClientApiError({
      ok: false,
      code: "STALE_ASSUMPTIONS",
      message: "스냅샷이 오래되었습니다.",
    }, "fallback");

    expect(parsed.code).toBe("STALE_ASSUMPTIONS");
    expect(parsed.message).toBe("스냅샷이 오래되었습니다.");
    expect(parsed.fixHref).toBe("/ops/assumptions");
  });

  it("falls back when payload is not parseable", () => {
    const parsed = resolveClientApiError(null, "기본 오류");

    expect(parsed.code).toBe("");
    expect(parsed.message).toBe("기본 오류");
    expect(parsed.fixHref).toBeUndefined();
  });
});
