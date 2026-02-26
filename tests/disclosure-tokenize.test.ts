import { describe, expect, it } from "vitest";
import { tokenizeTitle } from "../src/lib/dart/disclosureNormalize";

describe("disclosure title tokenize", () => {
  it("returns sorted unique tokens", () => {
    const tokens = tokenizeTitle("유상증자 결정 단일판매 공급계약 유상증자");
    expect(tokens).toEqual(["결정", "공급계약", "단일판매", "유상증자"]);
  });

  it("handles punctuation and spacing", () => {
    const tokens = tokenizeTitle("  [정정]  단일판매ㆍ공급계약   체결  ");
    expect(tokens).toEqual(["공급계약", "단일판매", "정정", "체결"]);
  });
});
