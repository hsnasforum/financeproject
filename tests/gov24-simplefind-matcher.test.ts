import { describe, expect, it } from "vitest";
import { buildSimpleFindKeywords } from "../src/lib/publicApis/gov24SimpleFind/matcher";
import { type Gov24SimpleFindInput } from "../src/lib/publicApis/gov24SimpleFind/types";

function baseInput(): Gov24SimpleFindInput {
  return {
    targetType: "individual",
    region: { sido: "부산", sigungu: "해운대구" },
    birth: { yyyymmdd: "19950101", gender: "F" },
    incomeBracket: "0_50",
    personalTraits: ["해당사항 없음"],
    householdTraits: ["해당사항 없음"],
    q: "",
  };
}

describe("gov24 simplefind matcher", () => {
  it("adds income keywords from bracket", () => {
    const keywords = buildSimpleFindKeywords(baseInput());
    expect(keywords.some((entry) => entry.includes("중위소득 50"))).toBe(true);
  });

  it("includes selected trait keywords", () => {
    const input = baseInput();
    input.personalTraits = ["장애인"];
    input.householdTraits = ["무주택세대"];
    const keywords = buildSimpleFindKeywords(input);
    expect(keywords).toContain("장애인");
    expect(keywords).toContain("무주택세대");
  });
});

