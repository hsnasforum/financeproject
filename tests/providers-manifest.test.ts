import { describe, expect, it } from "vitest";
import manifest from "../src/generated/providersManifest.json";

describe("providers manifest", () => {
  it("is non-empty and has unique entries", () => {
    expect(Array.isArray(manifest.svg)).toBe(true);
    expect(Array.isArray(manifest.png)).toBe(true);
    expect(manifest.svg.length + manifest.png.length).toBeGreaterThanOrEqual(8);

    const all = [...manifest.svg, ...manifest.png];
    const unique = new Set(all);
    expect(unique.size).toBe(all.length);
  });

  it("contains only 7-digit provider codes", () => {
    const all = [...manifest.svg, ...manifest.png];
    expect(all.every((key) => /^\d{7}$/.test(key))).toBe(true);
  });
});

