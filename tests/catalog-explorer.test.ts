import { describe, expect, it } from "vitest";
import {
  buildCatalogPresetHref,
  buildCatalogQueryKey,
  buildCatalogRequestParams,
  buildCatalogUrlParams,
  buildCatalogViewModel,
  formatCatalogRate,
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
    const parsed = parseCatalogUrlState(new URLSearchParams("kind=saving&q=%EA%B5%AD%EB%AF%BC&provider=%ED%95%9C%EA%B5%AD%EC%9D%80%ED%96%89&termMonths=12&minRate=3.5"));

    expect(parsed).toEqual({
      kind: "saving",
      q: "국민",
      provider: "한국은행",
      termMonths: "12",
      minRate: "3.5",
    });
    expect(parseCatalogUrlState(new URLSearchParams("kind=loan")).kind).toBe("deposit");
    expect(buildCatalogPresetHref("deposit", { q: " 테스트 ", termMonths: "6", ignored: "x" })).toBe("/products/catalog?kind=deposit&q=%ED%85%8C%EC%8A%A4%ED%8A%B8&termMonths=6");
    expect(buildCatalogUrlParams(parsed).toString()).toBe("kind=saving&q=%EA%B5%AD%EB%AF%BC&provider=%ED%95%9C%EA%B5%AD%EC%9D%80%ED%96%89&termMonths=12&minRate=3.5");
  });

  it("builds catalog request without exposing samplebank by default", () => {
    const key = buildCatalogQueryKey({
      kind: "deposit",
      q: "국민",
      provider: "국민은행",
      termMonths: "12",
      minRate: "3.5",
      includeSamplebank: false,
    });
    const params = buildCatalogRequestParams({
      kind: "deposit",
      q: "국민",
      provider: "국민은행",
      termMonths: "12",
      minRate: "3.5",
      includeSamplebank: false,
    });

    expect(key).toBe("deposit\u0000finlife,datago_kdb\u0000국민\u0000국민은행\u000012\u00003.5");
    expect(params.get("includeSources")).toBe("finlife,datago_kdb");
    expect(params.get("q")).toBe("국민");
    expect(params.get("provider")).toBe("국민은행");
    expect(params.get("termMonths")).toBe("12");
    expect(params.get("minRate")).toBe("3.5");
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
        facets: {
          providers: ["A은행", "B은행", "뒤페이지은행"],
          providerStatus: {
            state: "partial",
            issues: [{
              code: "PROVIDER_FACET_FAILED",
              sourceId: "datago_kdb",
              message: "전체 기관 목록을 불러오지 못했습니다.",
              recovery: "잠시 후 다시 조회해 주세요.",
            }],
          },
        },
        pageInfo: {
          hasMore: true,
          nextCursor: "next",
          partial: true,
          partialReasons: [{
            code: "SOURCE_QUERY_FAILED",
            sourceId: "datago_kdb",
            message: "이 원천의 상품 후보가 누락되었습니다.",
            recovery: "잠시 후 다시 조회해 주세요.",
          }],
        },
        provenance: {
          policy: "pinned_snapshot",
          capturedAt: "2026-09-01T00:00:00.000Z",
          versionFingerprint: "version-a",
          freshness: {
            checkedAt: "2026-09-01T00:00:00.000Z",
            overall: "fresh",
            sources: [],
          },
        },
      },
    } as unknown as Parameters<typeof parseCatalogResponse>[0]);

    const vm = buildCatalogViewModel({
      rows: parsed.pageItems,
      providerNames: parsed.providerNames,
      selectedProvider: "A은행",
      termMonths: "12",
      minRate: "3",
    });

    expect(parsed.hasMore).toBe(true);
    expect(parsed.nextCursor).toBe("next");
    expect(parsed.partial).toBe(true);
    expect(parsed.partialReasons).toEqual([
      expect.objectContaining({ code: "SOURCE_QUERY_FAILED", sourceId: "datago_kdb" }),
    ]);
    expect(parsed.providerStatus).toEqual({
      state: "partial",
      issues: [expect.objectContaining({ code: "PROVIDER_FACET_FAILED", sourceId: "datago_kdb" })],
    });
    expect(parsed.provenance?.versionFingerprint).toBe("version-a");
    expect(vm.providers.map((entry) => entry.id)).toEqual(["all", "A은행", "B은행", "뒤페이지은행"]);
    expect(vm.filteredRows.map((entry) => entry.stableId)).toEqual(["finlife:A"]);
  });

  it("labels missing rates without treating them as a numeric comparison", () => {
    expect(formatCatalogRate(null)).toBe("금리 정보 없음");
    expect(formatCatalogRate(3.25)).toBe("3.25%");

    const vm = buildCatalogViewModel({
      rows: [{
        stableId: "finlife:NO-RATE",
        sourceId: "finlife",
        kind: "deposit",
        externalKey: "NO-RATE",
        providerName: "가은행",
        productName: "금리 미공시 예금",
        options: [{ termMonths: 12, intrRate: null, intrRate2: null }],
      }],
      selectedProvider: "all",
      termMonths: "",
      minRate: "1",
    });

    expect(vm.filteredRows).toEqual([]);
  });
});
