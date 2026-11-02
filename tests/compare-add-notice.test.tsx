import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompareAddNotice, describeCompareAdd, formatCompareAddMessage } from "../src/components/recommend/CompareAddNotice";
import { addCompareId, compareStoreConfig, limitCompareIds, removeCompareId } from "../src/lib/products/compareStore";
import { attachUnifiedIds } from "../src/lib/recommend/recommendResultsViewModel";
import { recommendCandidates } from "../src/lib/recommend/score";
import type { UserRecommendProfile } from "../src/lib/recommend/types";
import { unifiedProductsToRecommendCandidates } from "../src/lib/recommend/unifiedAdapter";
import { buildStableUnifiedId } from "../src/lib/sources/unifiedEnrichPolicy";
import { storedFinlifeIdentity } from "../src/lib/sources/unifiedFinlifeIdentity";
import type { UnifiedProductView } from "../src/lib/sources/unifiedTypes";

const names: Record<string, string> = { a: "가 예금", b: "나 예금", c: "다 예금", d: "라 예금", e: "마 예금" };
const max = compareStoreConfig.max;

function add(before: string[], id: string, labelFor: (id: string) => string | undefined = (key) => names[key]) {
  // Uses the store's own add rule so the notice follows its FIFO limit and duplicate policy.
  const after = addCompareId(before, id, max);
  return { after, result: describeCompareAdd({ before, after, id, max, labelFor }) };
}

describe("compare add notice", () => {
  it("keeps the store limit at four", () => {
    expect(max).toBe(4);
  });

  it("reports a plain add with the current count", () => {
    const { result } = add(["a"], "b");
    expect(result).toEqual({ id: "b", status: "added", count: 2, max: 4, droppedLabels: [] });
    expect(formatCompareAddMessage(result)).toEqual({ lead: "상품이 비교함에 담겼습니다.", count: "현재 비교함 2/4개입니다." });
  });

  it("names the oldest product the basket dropped when a fifth one is added", () => {
    const { after, result } = add(["a", "b", "c", "d"], "e");
    expect(after).toEqual(["b", "c", "d", "e"]);
    expect(result).toEqual({ id: "e", status: "replaced", count: 4, max: 4, droppedLabels: ["가 예금"] });
    expect(formatCompareAddMessage(result).lead).toBe("비교함은 최대 4개까지라 먼저 담은 가 예금을(를) 빼고 새 상품을 담았습니다.");
  });

  it("does not invent a name for a dropped product added on another page", () => {
    const { result } = add(["x", "b", "c", "d"], "e");
    expect(result.droppedLabels).toEqual(["이전에 담은 상품"]);
  });

  it("reports a duplicate without changing the basket", () => {
    const { after, result } = add(["a", "b", "c", "d"], "b");
    expect(after).toEqual(["a", "b", "c", "d"]);
    expect(result).toEqual({ id: "b", status: "duplicate", count: 4, max: 4, droppedLabels: [] });
    expect(formatCompareAddMessage(result).lead).toBe("이미 비교함에 있는 상품입니다.");
  });

  it("renders a status region with the count and a compare link", () => {
    const { result } = add(["a", "b", "c", "d"], "e");
    const html = renderToStaticMarkup(<CompareAddNotice result={result} onClose={() => undefined} />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('href="/products/compare"');
    expect(html).toContain("현재 비교함 4/4개입니다.");
    expect(html).toContain('data-compare-status="replaced"');
    expect(html).toContain("안내 닫기");
  });
});

// Legacy FINLIFE aliases. A bare product code X and "finlife:X" resolve to the same unscoped lookup
// (parseUnifiedLookupId), so the basket treats them as one product: one entry, a duplicate notice and no eviction.
// Scoped ids ("finlife:<kind>:<company>:<code>"), other sources and upper-case prefixes stay distinct.
const SCOPED_A = "finlife:deposit:0010001:SYN-A";
const KDB_B = "datago_kdb:SYN-B";
const SCOPED_C = "finlife:saving:0020002:SYN-C";
const LEGACY = "LEG-1";
const LEGACY_ALIAS = "finlife:LEG-1";
const aliasNames: Record<string, string> = {
  [SCOPED_A]: "합성 A 예금",
  [KDB_B]: "합성 B 예금",
  [SCOPED_C]: "합성 C 적금",
  [LEGACY]: "합성 레거시 예금",
  "SYN-D": "합성 D 예금",
  "SYN-E": "합성 E 예금",
};

// Mirrors the add buttons: the notice compares the limited stored list with what the store saved.
function addTo(stored: string[], id: string) {
  const before = limitCompareIds(stored, max);
  const after = addCompareId(stored, id, max);
  return { after, result: describeCompareAdd({ before, after, id, max, labelFor: (key) => aliasNames[key] }) };
}

const entryProfile: UserRecommendProfile = {
  purpose: "seed-money",
  kind: "deposit",
  preferredTerm: 12,
  liquidityPref: "mid",
  rateMode: "max",
  topN: 5,
};

// The real id producers with synthetic input and no database: the catalog keeps the unified stableId and the
// recommendation turns the same stableId into its unifiedId (adapter -> score -> attachUnifiedIds).
function entryIds(row: { identityKey: string | null; kind: string; finPrdtCd: string; raw: Record<string, unknown> }) {
  const stableId = buildStableUnifiedId({ sourceId: "finlife", externalKey: row.finPrdtCd, identityKey: storedFinlifeIdentity(row) });
  const view: UnifiedProductView = {
    stableId,
    sourceId: "finlife",
    kind: row.kind,
    externalKey: row.finPrdtCd,
    providerName: "합성은행",
    productName: `합성 ${row.finPrdtCd}`,
    recommendDetail: {
      finPrdtCd: row.finPrdtCd,
      productRaw: {},
      options: [{ saveTrm: "12", intrRate: 3, intrRate2: 3.1, raw: {} }],
      sourceUpdatedAt: "2026-10-24T00:00:00.000Z",
    },
  };
  const candidates = unifiedProductsToRecommendCandidates({
    items: [view],
    profile: { preferredTerm: entryProfile.preferredTerm, rateMode: entryProfile.rateMode },
  });
  const scored = recommendCandidates({ kind: "deposit", candidates, profile: entryProfile });
  const response = attachUnifiedIds({ ok: true, items: scored.items.map((item) => ({ ...item, unifiedId: "" })) });
  return { catalog: stableId, recommend: (response.items ?? []).map((item) => item.unifiedId).join(",") };
}

describe("compare basket legacy FINLIFE aliases", () => {
  it("a prefixed alias of a stored bare code is a duplicate and a full basket keeps every product", () => {
    const stored = [SCOPED_A, KDB_B, SCOPED_C, LEGACY];
    const { after, result } = addTo(stored, LEGACY_ALIAS);
    expect(after).toEqual(stored);
    expect(result).toEqual({ id: LEGACY_ALIAS, status: "duplicate", count: 4, max: 4, droppedLabels: [] });
  });

  it("a bare code of a stored prefixed alias is a duplicate and a full basket keeps every product", () => {
    const stored = [SCOPED_A, KDB_B, SCOPED_C, LEGACY_ALIAS];
    const { after, result } = addTo(stored, LEGACY);
    expect(after).toEqual(stored);
    expect(result).toEqual({ id: LEGACY, status: "duplicate", count: 4, max: 4, droppedLabels: [] });
  });

  it("either alias order from an empty basket keeps one entry under the first id", () => {
    const bareFirst = addTo([], LEGACY);
    expect(bareFirst.after).toEqual([LEGACY]);
    expect(addTo(bareFirst.after, LEGACY_ALIAS)).toEqual({
      after: [LEGACY],
      result: { id: LEGACY_ALIAS, status: "duplicate", count: 1, max: 4, droppedLabels: [] },
    });
    const prefixedFirst = addTo([], LEGACY_ALIAS);
    expect(prefixedFirst.after).toEqual([LEGACY_ALIAS]);
    expect(addTo(prefixedFirst.after, LEGACY)).toEqual({
      after: [LEGACY_ALIAS],
      result: { id: LEGACY, status: "duplicate", count: 1, max: 4, droppedLabels: [] },
    });
  });

  it("stored aliases collapse to one entry before the limit, so adding a product drops nothing", () => {
    const stored = [SCOPED_A, LEGACY, LEGACY_ALIAS, KDB_B];
    expect(limitCompareIds(stored, max)).toEqual([SCOPED_A, LEGACY, KDB_B]);
    const { after, result } = addTo(stored, SCOPED_C);
    expect(after).toEqual([SCOPED_A, LEGACY, KDB_B, SCOPED_C]);
    expect(result).toEqual({ id: SCOPED_C, status: "added", count: 4, max: 4, droppedLabels: [] });
  });

  it("an alias collapsed from the stored list is not reported as a removed product", () => {
    const result = describeCompareAdd({
      before: [SCOPED_A, LEGACY, LEGACY_ALIAS, KDB_B],
      after: [SCOPED_A, LEGACY, KDB_B, SCOPED_C],
      id: SCOPED_C,
      max,
      labelFor: (key) => aliasNames[key],
    });
    expect(result).toEqual({ id: SCOPED_C, status: "added", count: 4, max: 4, droppedLabels: [] });
  });

  it("a removed product is named once even when it was stored under both aliases", () => {
    const result = describeCompareAdd({
      before: [LEGACY, LEGACY_ALIAS, KDB_B, SCOPED_C, "SYN-D"],
      after: [KDB_B, SCOPED_C, "SYN-D", "SYN-E"],
      id: "SYN-E",
      max,
      labelFor: (key) => aliasNames[key],
    });
    expect(result).toEqual({ id: "SYN-E", status: "replaced", count: 4, max: 4, droppedLabels: ["합성 레거시 예금"] });
  });

  it("removing either alias removes the stored entry", () => {
    expect(removeCompareId([SCOPED_A, LEGACY], LEGACY_ALIAS)).toEqual([SCOPED_A]);
    expect(removeCompareId([LEGACY_ALIAS, SCOPED_A], LEGACY)).toEqual([SCOPED_A]);
  });

  it("the duplicate notice keeps the pressed id without surrounding spaces", () => {
    const result = describeCompareAdd({ before: [LEGACY], after: [LEGACY], id: `  ${LEGACY_ALIAS} `, max, labelFor: (key) => aliasNames[key] });
    expect(result).toEqual({ id: LEGACY_ALIAS, status: "duplicate", count: 1, max: 4, droppedLabels: [] });
    expect(formatCompareAddMessage(result).lead).toBe("이미 비교함에 있는 상품입니다.");
  });

  it("spaces around the code after the prefix still match the stored code", () => {
    expect(addTo([LEGACY], "  finlife: LEG-1 ").after).toEqual([LEGACY]);
  });

  it("a legacy FINLIFE row added from the catalog and then from a recommendation stays one entry", () => {
    const ids = entryIds({ identityKey: null, kind: "deposit", finPrdtCd: "LEG-9", raw: {} });
    expect(ids).toEqual({ catalog: "LEG-9", recommend: "finlife:LEG-9" });
    const stored = [SCOPED_A, KDB_B, SCOPED_C, ids.catalog];
    const { after, result } = addTo(stored, ids.recommend);
    expect(after).toEqual(stored);
    expect(result.status).toBe("duplicate");
  });
});

describe("compare basket identity controls", () => {
  it("scoped ids for another kind or company and a bare code stay separate", () => {
    const stored = ["finlife:deposit:0010001:S1", "finlife:saving:0010001:S1", "finlife:deposit:0020002:S1"];
    expect(addTo(stored, "S1").after).toEqual([...stored, "S1"]);
    expect(addTo(["S1"], "finlife:deposit:0010001:S1").after).toEqual(["S1", "finlife:deposit:0010001:S1"]);
  });

  it("KDB and FINLIFE ids with the same code stay separate", () => {
    expect(addTo(["datago_kdb:S1"], "finlife:S1").after).toEqual(["datago_kdb:S1", "finlife:S1"]);
    expect(addTo(["datago_kdb:S1"], "S1").after).toEqual(["datago_kdb:S1", "S1"]);
  });

  it("a normal fifth product still replaces the oldest one", () => {
    const { after, result } = addTo([SCOPED_A, KDB_B, SCOPED_C, LEGACY], "SYN-D");
    expect(after).toEqual([KDB_B, SCOPED_C, LEGACY, "SYN-D"]);
    expect(result).toEqual({ id: "SYN-D", status: "replaced", count: 4, max: 4, droppedLabels: ["합성 A 예금"] });
  });

  it("empty, whitespace-only and upper-case prefixed ids keep their current meaning", () => {
    expect(addTo([SCOPED_A], "   ").after).toEqual([SCOPED_A]);
    expect(addTo([SCOPED_A], "finlife:").after).toEqual([SCOPED_A, "finlife:"]);
    expect(addTo([SCOPED_A], "finlife:   ").after).toEqual([SCOPED_A, "finlife:"]);
    expect(addTo([LEGACY], "FINLIFE:LEG-1").after).toEqual([LEGACY, "FINLIFE:LEG-1"]);
  });

  it("a scoped FINLIFE row gets the same id from the catalog and a recommendation", () => {
    const ids = entryIds({ identityKey: null, kind: "deposit", finPrdtCd: "SCP-1", raw: { fin_co_no: "0010001" } });
    expect(ids).toEqual({ catalog: "finlife:deposit:0010001:SCP-1", recommend: "finlife:deposit:0010001:SCP-1" });
    const stored = [SCOPED_A, KDB_B, SCOPED_C, ids.catalog];
    const { after, result } = addTo(stored, ids.recommend);
    expect(after).toEqual(stored);
    expect(result.status).toBe("duplicate");
  });
});
