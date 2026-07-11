import { beforeEach, describe, expect, it, vi } from "vitest";

const navigationMock = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

const reactMock = vi.hoisted(() => ({
  stateIndex: 0,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
  effectDependencies: [] as unknown[][],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigationMock.replace }),
  useSearchParams: () => navigationMock.searchParams,
}));

vi.mock("react", () => ({
  useEffect(effect: () => void, dependencies: unknown[]) {
    reactMock.effectDependencies.push(dependencies);
    effect();
  },
  useMemo<T>(factory: () => T) {
    return factory();
  },
  useState<T>(initialValue: T) {
    const index = reactMock.stateIndex;
    reactMock.stateIndex += 1;
    const setter = reactMock.setters[index] ?? vi.fn();
    reactMock.setters[index] = setter;
    return [initialValue, setter] as const;
  },
}));

import {
  useProductExplorerQueryController,
  useProductExplorerQuerySync,
} from "../src/components/products/useProductExplorerQueryController";

beforeEach(() => {
  navigationMock.replace.mockReset();
  navigationMock.searchParams = new URLSearchParams();
  reactMock.stateIndex = 0;
  reactMock.setters.length = 0;
  reactMock.effectDependencies.length = 0;
});

describe("product query controller hooks", () => {
  it("maps all parsed query values and stable state setters to the controller contract", () => {
    navigationMock.searchParams = new URLSearchParams(
      "finCoNo=001&q=bank&scan=all&maxPages=12&view=option&optSort=term_asc&optGroup=1&terms=6,12&types=online&benefits=prefer&amount=5000000&fav=1&sort=nameAsc",
    );

    const controller = useProductExplorerQueryController({
      defaultSortKey: "rateDesc",
      initialTopFinGrpNo: "030300",
      initialPageNo: 3,
    });
    const setters = [
      controller.setTopFinGrpNo,
      controller.setSelectedFinCoNo,
      controller.setPageNo,
      controller.setScanMode,
      controller.setMaxPages,
      controller.setViewMode,
      controller.setSortKey,
      controller.setOptionSortKey,
      controller.setOptionGroup,
      controller.setSelectedTerms,
      controller.setAmountInput,
      controller.setSelectedProductTypes,
      controller.setSelectedBenefits,
      controller.setSearchQuery,
      controller.setOnlyFavorites,
    ];

    expect({
      topFinGrpNo: controller.topFinGrpNo,
      selectedFinCoNo: controller.selectedFinCoNo,
      pageNo: controller.pageNo,
      scanMode: controller.scanMode,
      maxPages: controller.maxPages,
      viewMode: controller.viewMode,
      sortKey: controller.sortKey,
      optionSortKey: controller.optionSortKey,
      optionGroup: controller.optionGroup,
      selectedTerms: controller.selectedTerms,
      amountInput: controller.amountInput,
      selectedProductTypes: controller.selectedProductTypes,
      selectedBenefits: controller.selectedBenefits,
      searchQuery: controller.searchQuery,
      onlyFavorites: controller.onlyFavorites,
    }).toEqual({
      topFinGrpNo: "030300",
      selectedFinCoNo: "001",
      pageNo: 3,
      scanMode: "all",
      maxPages: 12,
      viewMode: "option",
      sortKey: "nameAsc",
      optionSortKey: "term_asc",
      optionGroup: true,
      selectedTerms: ["6", "12"],
      amountInput: "5000000",
      selectedProductTypes: ["online"],
      selectedBenefits: ["prefer"],
      searchQuery: "bank",
      onlyFavorites: true,
    });
    expect(setters).toEqual(reactMock.setters);

    reactMock.stateIndex = 0;
    const rerendered = useProductExplorerQueryController({
      defaultSortKey: "rateDesc",
      initialTopFinGrpNo: "030300",
      initialPageNo: 3,
    });
    expect([
      rerendered.setTopFinGrpNo,
      rerendered.setSelectedFinCoNo,
      rerendered.setPageNo,
      rerendered.setScanMode,
      rerendered.setMaxPages,
      rerendered.setViewMode,
      rerendered.setSortKey,
      rerendered.setOptionSortKey,
      rerendered.setOptionGroup,
      rerendered.setSelectedTerms,
      rerendered.setAmountInput,
      rerendered.setSelectedProductTypes,
      rerendered.setSelectedBenefits,
      rerendered.setSearchQuery,
      rerendered.setOnlyFavorites,
    ]).toEqual(setters);
  });

  it("calls router.replace with the serialized target and scroll disabled", () => {
    useProductExplorerQuerySync({
      kind: "pension",
      topFinGrpNo: "020000",
      pageNo: 2,
      scanMode: "page",
      maxPages: "auto",
      viewMode: "product",
      optionSortKey: "best_desc",
      optionGroup: false,
      selectedFinCoNo: null,
      searchQuery: "alpha",
      onlyFavorites: false,
      sortKey: "rateDesc",
      defaultSortKey: "rateDesc",
      selectedTerms: [],
      selectedProductTypes: [],
      selectedBenefits: [],
      amountInput: "10000000",
    });

    expect(navigationMock.replace).toHaveBeenCalledOnce();
    expect(navigationMock.replace).toHaveBeenCalledWith(
      "?topFinGrpNo=020000&pageNo=2&pageSize=50&q=alpha",
      { scroll: false },
    );
    expect(reactMock.effectDependencies).toHaveLength(1);
  });
});
