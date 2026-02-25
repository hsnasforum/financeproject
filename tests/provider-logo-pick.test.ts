import { describe, expect, it } from "vitest";
import { pickLogoSrc } from "../src/lib/providersManifest";

describe("pickLogoSrc", () => {
  it("returns svg path when key exists in svg manifest", () => {
    const src = pickLogoSrc("0010001", { svg: ["0010001"], png: [] });
    expect(src).toBe("/providers/0010001.svg");
  });

  it("returns png path when key exists in png manifest", () => {
    const src = pickLogoSrc("0010001", { svg: [], png: ["0010001"] });
    expect(src).toBe("/providers/0010001.png");
  });

  it("returns null when key is not in manifest", () => {
    const src = pickLogoSrc("0099999", { svg: ["0010001"], png: [] });
    expect(src).toBeNull();
  });
});

