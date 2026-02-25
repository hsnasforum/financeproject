import { describe, expect, it } from "vitest";
import { isRegionMatch } from "../src/lib/gov24/regionFilter";

describe("gov24 region hard filter", () => {
  const fixtures = [
    {
      key: "inc-local-regional",
      input: {
        itemRegionScope: "REGIONAL" as const,
        itemSido: "인천",
        orgType: "local",
        orgName: "인천광역시",
        title: "인천 청년 지원",
      },
    },
    {
      key: "wando-local-regional",
      input: {
        itemRegionScope: "REGIONAL" as const,
        itemSido: "전남",
        itemSigungu: "완도군",
        orgType: "local",
        orgName: "전라남도 완도군",
        title: "완도군 복지",
      },
    },
    {
      key: "nationwide-central",
      input: {
        itemRegionScope: "NATIONWIDE" as const,
        orgType: "central",
        orgName: "보건복지부",
        title: "전국 지원",
      },
    },
    {
      key: "unknown-local-incheon",
      input: {
        itemRegionScope: "UNKNOWN" as const,
        orgType: "local",
        orgName: "인천광역시 복지정책과",
        title: "청년 지원",
      },
    },
  ];

  it("excludes cross-region local benefits and keeps nationwide when selected sido is 부산", () => {
    const selected = { selectedSido: "부산", selectedSigungu: "부산진구", query: "" };

    expect(isRegionMatch({ ...selected, ...fixtures[0].input })).toBe(false);
    expect(isRegionMatch({ ...selected, ...fixtures[1].input })).toBe(false);
    expect(isRegionMatch({ ...selected, ...fixtures[2].input })).toBe(true);
    expect(isRegionMatch({ ...selected, ...fixtures[3].input })).toBe(false);
  });

  it("blocks cross-region exposure from regional text query without selected sido", () => {
    const selected = { selectedSido: null, selectedSigungu: null, query: "부산 진구 소득 여성 청년" };

    expect(isRegionMatch({ ...selected, ...fixtures[0].input })).toBe(false);
    expect(isRegionMatch({ ...selected, ...fixtures[1].input })).toBe(false);
    expect(isRegionMatch({ ...selected, ...fixtures[2].input })).toBe(true);
    expect(isRegionMatch({ ...selected, ...fixtures[3].input })).toBe(false);
  });
});
