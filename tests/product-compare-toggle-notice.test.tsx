import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
// Planned module (not written yet). Until it exists this file fails to import: that is unfinished
// preparation, not the product RED. The product RED is the loan-page E2E.
import {
  describeCompareToggle,
  formatCompareToggleMessage,
  ProductCompareToggleNotice,
  readCompareBasketForToggle,
  toggleCompareWithNotice,
} from "../src/components/products/ProductCompareToggleNotice";
import { productShelfConfig, toggleCompare } from "../src/lib/state/productShelf";

// Synthetic ids only.
const D = ["finlife:deposit:0010001:D1", "finlife:deposit:0010001:D2", "finlife:deposit:0010001:D3", "finlife:deposit:0010001:D4"];
const L1 = "finlife:mortgage-loan:0010002:L1";
const names: Record<string, string> = { [D[0]]: "가 예금", [L1]: "가 주담대" };
const labelFor = (id: string) => names[id];
const max = productShelfConfig.maxCompareBasket;

function installWindow(compareBasket: string[]) {
  const store = new Map<string, string>([
    [productShelfConfig.storageKey, JSON.stringify({ schemaVersion: 1, favorites: [], recentViewed: [], compareBasket })],
    [productShelfConfig.legacyCompareStorageKey, JSON.stringify(compareBasket)],
  ]);
  const writes: string[] = [];
  const events: string[] = [];
  vi.stubGlobal("CustomEvent", class {
    type: string;
    detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      this.type = type;
      this.detail = init?.detail;
    }
  });
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes.push(key);
      store.set(key, value);
    },
  };
  vi.stubGlobal("window", { localStorage, dispatchEvent: (event: { type: string }) => (events.push(event.type), true) });
  const basket = () => JSON.parse(store.get(productShelfConfig.legacyCompareStorageKey) ?? "[]") as string[];
  return { localStorage, writes, events, basket };
}

describe("loan compare toggle notice (planned contract)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("describes an add to a basket of three with exact ids", () => {
    expect(describeCompareToggle({ before: D.slice(0, 3), after: [...D.slice(0, 3), L1], id: L1, max, labelFor }))
      .toEqual({ id: L1, status: "added", count: 4, max: 4, droppedLabels: [] });
  });

  it("describes removing the pressed product", () => {
    expect(describeCompareToggle({ before: [...D.slice(0, 3), L1], after: D.slice(0, 3), id: L1, max, labelFor }))
      .toEqual({ id: L1, status: "removed", count: 3, max: 4, droppedLabels: [] });
  });

  it("names the product the FIFO limit dropped, or a neutral label when it is not on this page", () => {
    expect(describeCompareToggle({ before: D, after: [D[1], D[2], D[3], L1], id: L1, max, labelFor }))
      .toEqual({ id: L1, status: "replaced", count: 4, max: 4, droppedLabels: ["가 예금"] });
    expect(describeCompareToggle({ before: D, after: [D[1], D[2], D[3], L1], id: L1, max, labelFor: () => undefined })?.droppedLabels)
      .toEqual(["이전에 담은 상품"]);
  });

  it("returns no notice for a blank id", () => {
    expect(describeCompareToggle({ before: D, after: D, id: "  ", max, labelFor })).toBeNull();
  });

  it("reads before from storage, not the rendered snapshot: rendered [D1,D2,D3,L1] but stored [D1..D4] is a FIFO add", () => {
    const win = installWindow(D);
    expect(readCompareBasketForToggle(win.localStorage)).toEqual(D);
    expect(win.writes).toEqual([]);
    const result = toggleCompareWithNotice({ id: L1, storage: win.localStorage, toggle: toggleCompare, max, labelFor });
    expect(result).toEqual({ id: L1, status: "replaced", count: 4, max: 4, droppedLabels: ["가 예금"] });
    expect(win.basket()).toEqual([D[1], D[2], D[3], L1]);
    // Only the toggle itself writes (two keys, one event) on a v1 shelf; the before read adds nothing.
    expect(win.writes).toEqual([productShelfConfig.storageKey, productShelfConfig.legacyCompareStorageKey]);
    expect(win.events).toEqual(["products:shelf-updated"]);
  });

  it("reports a removal when the rendered snapshot lacks the product but storage already has it", () => {
    const win = installWindow([...D.slice(0, 3), L1]);
    const result = toggleCompareWithNotice({ id: L1, storage: win.localStorage, toggle: toggleCompare, max, labelFor });
    expect(result).toEqual({ id: L1, status: "removed", count: 3, max: 4, droppedLabels: [] });
    expect(win.basket()).toEqual(D.slice(0, 3));
  });

  it("formats the removal and renders an accessible status region next to the card", () => {
    const removed = { id: L1, status: "removed" as const, count: 3, max: 4, droppedLabels: [] };
    expect(formatCompareToggleMessage(removed)).toEqual({ lead: "비교함에서 뺐습니다.", count: "현재 비교함 3/4개입니다." });
    expect(formatCompareToggleMessage({ ...removed, status: "replaced", count: 4, droppedLabels: ["가 예금"] }).lead)
      .toBe("비교함은 최대 4개까지라 먼저 담은 가 예금을(를) 빼고 새 상품을 담았습니다.");
    const html = renderToStaticMarkup(<ProductCompareToggleNotice result={removed} onClose={() => undefined} />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('data-testid="product-compare-toggle-notice"');
    expect(html).toContain('data-compare-status="removed"');
    expect(html).toContain('href="/products/compare"');
    expect(html).toContain("안내 닫기");
    expect(html).toContain("현재 비교함 3/4개입니다.");
  });
});
