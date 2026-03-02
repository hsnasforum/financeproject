import { describe, expect, it } from "vitest";
import { redactText } from "../../../src/lib/planning/privacy/redact";

describe("planning privacy redactText", () => {
  it("masks bearer and env token values", () => {
    const input = "Authorization: Bearer abc.def GITHUB_TOKEN=ghp_12345 ECOS_API_KEY=secret";
    const output = redactText(input);
    expect(output).toContain("Bearer ***");
    expect(output).toContain("GITHUB_TOKEN=***");
    expect(output).toContain("ECOS_API_KEY=***");
    expect(output).not.toContain("ghp_12345");
    expect(output).not.toContain("abc.def");
    expect(output).not.toContain("secret");
  });

  it("masks .data paths and large amount-like numbers", () => {
    const input = "path=.data/planning/profiles/u1.json amount=5100000 keep=120";
    const output = redactText(input);
    expect(output).toContain("path=<DATA_PATH>");
    expect(output).toContain("amount=<AMOUNT>");
    expect(output).toContain("keep=120");
  });
});
