import { describe, expect, it } from "vitest";
import { pickGov24ServiceId } from "../src/lib/publicApis/odcloudScan";

describe("gov24 id pick", () => {
  it("picks service id from mixed key variants", () => {
    const a = pickGov24ServiceId({ 서비스ID: "ABC-123" });
    const b = pickGov24ServiceId({ SVC_ID: "svc-999" });
    const c = pickGov24ServiceId({ SERV_ID: "serv-77" });
    expect(a.id).toBe("ABC-123");
    expect(b.id).toBe("svc-999");
    expect(c.id).toBe("serv-77");
    expect(a.usedFallback).toBe(false);
  });

  it("uses stable fallback hash when id keys are absent", () => {
    const row = { 서비스명: "청년 지원", 소관기관명: "보건복지부", 신청방법: "온라인", 링크: "https://example.com" };
    const picked = pickGov24ServiceId(row);
    expect(picked.id?.startsWith("fh:")).toBe(true);
    expect(picked.usedFallback).toBe(true);
  });
});

