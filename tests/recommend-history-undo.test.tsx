import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const hookHarness = vi.hoisted(() => {
  const stateSlots: unknown[] = [];
  const refSlots: Array<{ current: unknown }> = [];
  let stateCursor = 0;
  let refCursor = 0;

  return {
    beginRender() {
      stateCursor = 0;
      refCursor = 0;
    },
    reset() {
      stateSlots.length = 0;
      refSlots.length = 0;
      stateCursor = 0;
      refCursor = 0;
    },
    useCallback<T>(callback: T): T {
      return callback;
    },
    useEffect(effect: () => void | (() => void)) {
      effect();
    },
    useMemo<T>(factory: () => T): T {
      return factory();
    },
    useRef<T>(initialValue: T) {
      const index = refCursor++;
      if (!(index in refSlots)) refSlots[index] = { current: initialValue };
      return refSlots[index] as { current: T };
    },
    useState<T>(initialState: T | (() => T)) {
      const index = stateCursor++;
      if (!(index in stateSlots)) {
        stateSlots[index] = typeof initialState === "function"
          ? (initialState as () => T)()
          : initialState;
      }
      const setState = (nextState: T | ((prevState: T) => T)) => {
        const previous = stateSlots[index] as T;
        stateSlots[index] = typeof nextState === "function"
          ? (nextState as (value: T) => T)(previous)
          : nextState;
      };
      return [stateSlots[index] as T, setState] as const;
    },
  };
});

const ownerHarness = vi.hoisted(() => ({ ownerId: "alice" }));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useCallback: hookHarness.useCallback,
    useEffect: hookHarness.useEffect,
    useMemo: hookHarness.useMemo,
    useRef: hookHarness.useRef,
    useState: hookHarness.useState,
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/recommend/RecommendOwnerContext", () => ({
  useRecommendOwner: () => ownerHarness.ownerId,
}));

import RecommendPage from "../src/app/recommend/page";
import { RecommendHistoryClient } from "../src/components/RecommendHistoryClient";
import { Button } from "../src/components/ui/Button";
import {
  buildStoredRecommendProfile,
  buildStoredRecommendResult,
  parseStoredRecommendResult,
  recommendProfileStorageKey,
  recommendResultStorageKey,
} from "../src/lib/recommend/recommendStorageAdapter";
import {
  listRuns,
  saveRun,
  type SavedRunInput,
} from "../src/lib/recommend/savedRunsStore";
import { recommendOwnerId } from "../src/lib/recommend/ownerNamespace";
import { defaults as recommendProfileDefaults } from "../src/lib/schemas/recommendProfile";

type TreeElement = ReactElement<{ children?: ReactNode; [key: string]: unknown }>;

function isTreeElement(node: ReactNode): node is TreeElement {
  return typeof node === "object" && node !== null && "type" in node && "props" in node;
}

function getText(node: ReactNode): string {
  if (Array.isArray(node)) return node.map((child) => getText(child)).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!isTreeElement(node)) return "";
  return getText(node.props.children);
}

function findElements(node: ReactNode, predicate: (element: TreeElement) => boolean): TreeElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => findElements(child, predicate));
  if (!isTreeElement(node)) return [];
  return [
    ...(predicate(node) ? [node] : []),
    ...findElements(node.props.children, predicate),
  ];
}

function findButton(node: ReactNode, label: string): TreeElement | undefined {
  return findElements(node, (element) => element.type === Button && getText(element.props.children) === label)[0];
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

function installBrowserStorage(storage: Storage): void {
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("sessionStorage", createMemoryStorage());
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    localStorage: storage,
    sessionStorage: globalThis.sessionStorage,
  });
}

function makeRun(runId: string, savedAt: string, purpose: SavedRunInput["profile"]["purpose"]): SavedRunInput {
  return {
    runId,
    savedAt,
    profile: {
      purpose,
      kind: "deposit",
      preferredTerm: 12,
      liquidityPref: "mid",
      rateMode: "max",
      topN: 3,
      candidatePool: "unified",
      candidateSources: ["finlife"],
      depositProtection: "any",
      weights: { rate: 0.55, term: 0.3, liquidity: 0.15 },
    },
    items: [{
      unifiedId: `finlife:${runId}`,
      providerName: "테스트은행",
      productName: `테스트상품 ${runId}`,
      kind: "deposit",
      termMonths: 12,
      appliedRate: 3.2,
      rank: 1,
      finalScore: 0.8,
    }],
  };
}

function renderHistory(): ReactNode {
  hookHarness.beginRender();
  return RecommendHistoryClient({});
}

function renderRecommendOwned(): ReactNode {
  const page = RecommendPage();
  if (!isTreeElement(page)) throw new Error("recommend page element is missing");
  const ownedElement = page.props.children;
  if (!isTreeElement(ownedElement) || typeof ownedElement.type !== "function") {
    throw new Error("owned recommend page element is missing");
  }
  const OwnedRecommendPage = ownedElement.type as (props: TreeElement["props"]) => ReactNode;
  hookHarness.beginRender();
  return OwnedRecommendPage(ownedElement.props);
}

async function settleAsyncState(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(async () => {
  await settleAsyncState();
  hookHarness.reset();
  ownerHarness.ownerId = "alice";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("recommend history delete undo", () => {
  it("replaces the prior undo snapshot on the next individual delete and keeps owner storage isolated", () => {
    const storage = createMemoryStorage();
    installBrowserStorage(storage);
    const alice = recommendOwnerId("alice");
    const bob = recommendOwnerId("bob");
    saveRun(alice, makeRun("run-seed", "2026-08-01T01:00:00.000Z", "seed-money"));
    saveRun(alice, makeRun("run-long", "2026-08-02T01:00:00.000Z", "long-term"));
    saveRun(alice, makeRun("run-emergency", "2026-08-03T01:00:00.000Z", "emergency"));
    saveRun(bob, makeRun("run-bob", "2026-08-04T01:00:00.000Z", "seed-money"));

    let tree = renderHistory();
    const selection = findElements(tree, (element) => element.type === "input" && String(element.props["aria-label"] ?? "").includes("비교 선택"))[0];
    const emergencyDelete = findElements(tree, (element) => (
      element.type === Button
      && String(element.props["aria-label"] ?? "").includes("단기 비상금 추천 기록 삭제")
    ))[0];

    expect(selection?.props["aria-label"]).toMatch(/2026|목돈 마련|장기 저축|단기 비상금/);
    expect(emergencyDelete).toBeDefined();
    (emergencyDelete?.props as { onClick?: () => void }).onClick?.();

    tree = renderHistory();
    const longTermDelete = findElements(tree, (element) => (
      element.type === Button
      && String(element.props["aria-label"] ?? "").includes("장기 저축 추천 기록 삭제")
    ))[0];
    (longTermDelete?.props as { onClick?: () => void }).onClick?.();

    tree = renderHistory();
    const undoButton = findButton(tree, "되돌리기");
    const status = findElements(tree, (element) => element.props.role === "status")[0];
    expect(status?.props["aria-live"]).toBe("polite");
    expect(getText(status?.props.children)).toContain("삭제했습니다");
    saveRun(alice, makeRun("run-new", "2026-08-05T01:00:00.000Z", "seed-money"));
    (undoButton?.props as { onClick?: () => void }).onClick?.();

    expect(listRuns(alice).map((run) => run.runId)).toEqual(["run-new", "run-long", "run-seed"]);
    expect(listRuns(bob).map((run) => run.runId)).toEqual(["run-bob"]);
    tree = renderHistory();
    expect(findButton(tree, "되돌리기")).toBeUndefined();
    expect(getText(tree)).toContain("마지막 삭제를 되돌려");
  });

  it("clears and restores only the current account records with an explicit risk label", () => {
    const storage = createMemoryStorage();
    installBrowserStorage(storage);
    const alice = recommendOwnerId("alice");
    const bob = recommendOwnerId("bob");
    saveRun(alice, makeRun("run-alice", "2026-08-01T01:00:00.000Z", "seed-money"));
    saveRun(bob, makeRun("run-bob", "2026-08-02T01:00:00.000Z", "long-term"));

    let tree = renderHistory();
    const clearButton = findButton(tree, "현재 계정 기록 전체 삭제");
    expect(clearButton?.props["aria-label"]).toBe("현재 계정의 추천 기록 전체 삭제");
    (clearButton?.props as { onClick?: () => void }).onClick?.();

    expect(listRuns(alice)).toEqual([]);
    expect(listRuns(bob).map((run) => run.runId)).toEqual(["run-bob"]);
    tree = renderHistory();
    (findButton(tree, "되돌리기")?.props as { onClick?: () => void }).onClick?.();

    expect(listRuns(alice).map((run) => run.runId)).toEqual(["run-alice"]);
    expect(listRuns(bob).map((run) => run.runId)).toEqual(["run-bob"]);
  });

  it("restores the owner-validated recent result to its existing key once", async () => {
    const storage = createMemoryStorage();
    installBrowserStorage(storage);
    const alice = recommendOwnerId("alice");
    const bob = recommendOwnerId("bob");
    const profile = recommendProfileDefaults();
    const aliceStored = buildStoredRecommendResult({
      ownerId: alice,
      profile,
      meta: { userId: alice },
      now: new Date("2026-08-03T01:00:00.000Z"),
    });
    const bobStored = buildStoredRecommendResult({
      ownerId: bob,
      profile,
      meta: { userId: bob },
      now: new Date("2026-08-04T01:00:00.000Z"),
    });
    storage.setItem(recommendResultStorageKey(alice), JSON.stringify(aliceStored));
    storage.setItem(recommendResultStorageKey(bob), JSON.stringify(bobStored));

    renderRecommendOwned();
    await settleAsyncState();
    let tree = renderRecommendOwned();
    const deleteButton = findButton(tree, "기록 삭제");
    expect(deleteButton?.props["aria-label"]).toMatch(/2026|목돈 마련/);
    (deleteButton?.props as { onClick?: () => void }).onClick?.();

    expect(storage.getItem(recommendResultStorageKey(alice))).toBeNull();
    expect(parseStoredRecommendResult(bob, storage.getItem(recommendResultStorageKey(bob)))).toEqual(bobStored);
    tree = renderRecommendOwned();
    const status = findElements(tree, (element) => element.props.role === "status")[0];
    expect(status?.props["aria-live"]).toBe("polite");
    expect(getText(status?.props.children)).toContain("한 번 되돌릴 수 있습니다");
    (findButton(tree, "되돌리기")?.props as { onClick?: () => void }).onClick?.();

    expect(parseStoredRecommendResult(alice, storage.getItem(recommendResultStorageKey(alice)))).toEqual(aliceStored);
    tree = renderRecommendOwned();
    expect(findButton(tree, "되돌리기")).toBeUndefined();
    expect(getText(tree)).toContain("최근 추천 결과를 복원했습니다");
  });

  it("shows normalized stored weights, the current sum, and the default reset", async () => {
    const storage = createMemoryStorage();
    installBrowserStorage(storage);
    const alice = recommendOwnerId("alice");
    storage.setItem(recommendProfileStorageKey(alice), JSON.stringify(buildStoredRecommendProfile(alice, {
      ...recommendProfileDefaults(),
      weights: { rate: 1, term: 1, liquidity: 1 },
    })));

    renderRecommendOwned();
    await settleAsyncState();
    let tree = renderRecommendOwned();
    const advancedButton = findElements(tree, (element) => (
      element.type === "button" && getText(element.props.children) === "가중치 설정"
    ))[0];
    (advancedButton?.props as { onClick?: () => void }).onClick?.();

    tree = renderRecommendOwned();
    expect(getText(tree)).toContain("현재 합계 100%");
    expect(getText(tree)).toContain("가중치 합계 300%를 기존 비율대로 100%로 정규화했습니다");

    (findButton(tree, "기본값 복원")?.props as { onClick?: () => void }).onClick?.();
    tree = renderRecommendOwned();
    expect(getText(tree)).toContain("가중치를 기본값(금리 55% · 기간 30% · 유동성 15%)으로 복원했습니다");
  });
});
