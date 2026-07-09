import { describe, expect, it } from "vitest";
import {
  buildCatalogPresetHref,
  buildCatalogQueryKey,
  buildCatalogRequestParams,
  buildCatalogViewModel,
  isCatalogSamplebankVisible,
  parseCatalogUrlState,
  parseCatalogResponse,
} from "../src/lib/products/catalogExplorer";

describe("catalog explorer helpers", () => {
  it("keeps samplebank hidden in production public catalog", () => {
    expect(isCatalogSamplebankVisible({ nodeEnv: "production", publicFlag: "" })).toBe(false);
    expect(isCatalogSamplebankVisible({ nodeEnv: "production", publicFlag: "1" })).toBe(false);
    expect(isCatalogSamplebankVisible({ nodeEnv: "development", publicFlag: "" })).toBe(true);
    expect(isCatalogSamplebankVisible({ nodeEnv: "development", publicFlag: "0" })).toBe(false);
  });

  it("parses catalog kind deep-link state and builds category preset hrefs", () => {
    const parsed = parseCatalogUrlState(new URLSearchParams("kind=saving&q=%EA%B5%AD%EB%AF%BC&termMonths=12&minRate=3.5"));

    expect(parsed).toEqual({
      kind: "saving",
      q: "국민",
      termMonths: "12",
      minRate: "3.5",
    });
    expect(parseCatalogUrlState(new URLSearchParams("kind=loan")).kind).toBe("deposit");
    expect(buildCatalogPresetHref("deposit", { q: " 테스트 ", termMonths: "6", ignored: "x" })).toBe("/products/catalog?kind=deposit&q=%ED%85%8C%EC%8A%A4%ED%8A%B8&termMonths=6");
  });

  it("builds catalog request without exposing samplebank by default", () => {
    const key = buildCatalogQueryKey({ kind: "deposit", q: "국민", includeSamplebank: false });
    const params = buildCatalogRequestParams({ kind: "deposit", q: "국민", includeSamplebank: false });

    expect(key).toBe("deposit\u0000finlife,datago_kdb\u0000국민");
    expect(params.get("includeSources")).toBe("finlife,datago_kdb");
    expect(params.get("q")).toBe("국민");
  });

  it("maps catalog response and filters rows as a view model", () => {
    const parsed = parseCatalogResponse({
      ok: true,
      data: {
        items: [
          {
            stableId: "finlife:A",
            sourceId: "finlife",
            kind: "deposit",
            externalKey: "A",
            providerName: "A은행",
            productName: "A 예금",
            options: [{ termMonths: 12, intrRate: 2.1, intrRate2: 3.2 }],
          },
          {
            stableId: "finlife:B",
            sourceId: "finlife",
            kind: "deposit",
            externalKey: "B",
            providerName: "B은행",
            productName: "B 예금",
            options: [{ termMonths: 6, intrRate: 1.1, intrRate2: 1.5 }],
          },
        ],
        pageInfo: { hasMore: true, nextCursor: "next" },
      },
    });

    const vm = buildCatalogViewModel({
      rows: parsed.pageItems,
      selectedProvider: "A은행",
      termMonths: "12",
      minRate: "3",
    });

    expect(parsed.hasMore).toBe(true);
    expect(parsed.nextCursor).toBe("next");
    expect(vm.providers.map((entry) => entry.id)).toEqual(["all", "A은행", "B은행"]);
    expect(vm.filteredRows.map((entry) => entry.stableId)).toEqual(["finlife:A"]);
  });
});
