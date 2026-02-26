import { describe, expect, it } from "vitest";
import { getActivePreset, parseAlertProfile, toProfileJson } from "../src/lib/dart/alertProfile";

describe("alert profile", () => {
  it("parses valid profile with presets and rules", () => {
    const parsed = parseAlertProfile({
      version: 1,
      activePresetId: "aggressive",
      presets: [
        {
          id: "default",
          name: "Default",
          preferences: { minScore: 70 },
          rules: [],
        },
        {
          id: "aggressive",
          name: "Aggressive",
          preferences: { minScore: 80, maxItems: 10 },
          rules: [
            { id: "r1", kind: "keyword", match: "contains", value: "유상증자", enabled: true, createdAt: "2026-02-26T10:00:00.000Z" },
          ],
        },
      ],
    });

    expect(parsed.presets).toHaveLength(2);
    expect(getActivePreset(parsed).id).toBe("aggressive");
    expect(getActivePreset(parsed).preferences.minScore).toBe(80);
  });

  it("fails on invalid profile shape and invalid regex rule", () => {
    expect(() => parseAlertProfile({ version: 1, presets: [] })).toThrow();
    expect(() =>
      parseAlertProfile({
        version: 1,
        activePresetId: "default",
        presets: [
          {
            id: "default",
            name: "Default",
            preferences: { minScore: 70 },
            rules: [
              { id: "bad", kind: "keyword", match: "regex", value: "(.*)+", enabled: true, createdAt: "2026-02-26T10:00:00.000Z" },
            ],
          },
        ],
      }),
    ).toThrow();
  });

  it("falls back to first preset when activePresetId does not exist", () => {
    const parsed = parseAlertProfile({
      version: 1,
      activePresetId: "missing",
      presets: [
        {
          id: "p1",
          name: "P1",
          preferences: { minScore: 50 },
          rules: [],
        },
        {
          id: "p2",
          name: "P2",
          preferences: { minScore: 60 },
          rules: [],
        },
      ],
    });

    expect(getActivePreset(parsed).id).toBe("p1");
    const json = toProfileJson(parsed.presets, parsed.activePresetId);
    expect(json.presets).toHaveLength(2);
  });
});
