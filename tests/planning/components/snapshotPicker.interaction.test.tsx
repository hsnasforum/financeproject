import type { ComponentProps, ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "../../../src/components/ui/Button";
import { type SnapshotListItem } from "../../../src/app/planning/_lib/snapshotList";

const hookHarness = vi.hoisted(() => {
  const stateSlots: unknown[] = [];
  let cursor = 0;

  return {
    beginRender() {
      cursor = 0;
    },
    reset() {
      stateSlots.length = 0;
      cursor = 0;
    },
    useMemo<T>(factory: () => T): T {
      return factory();
    },
    useState<T>(initialState: T | (() => T)) {
      const index = cursor++;
      if (!(index in stateSlots)) {
        stateSlots[index] = typeof initialState === "function"
          ? (initialState as () => T)()
          : initialState;
      }

      const setState = (nextState: T | ((prevState: T) => T)) => {
        const prevState = stateSlots[index] as T;
        stateSlots[index] = typeof nextState === "function"
          ? (nextState as (prevState: T) => T)(prevState)
          : nextState;
      };

      return [stateSlots[index] as T, setState] as const;
    },
  };
});

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useMemo: hookHarness.useMemo,
    useState: hookHarness.useState,
  };
});

import SnapshotPicker from "../../../src/app/planning/_components/SnapshotPicker";

type SnapshotPickerProps = ComponentProps<typeof SnapshotPicker>;
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

function findElement(node: ReactNode, predicate: (element: TreeElement) => boolean): TreeElement | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
    return undefined;
  }
  if (!isTreeElement(node)) return undefined;
  if (predicate(node)) return node;
  return findElement(node.props.children, predicate);
}

function findButton(node: ReactNode, label: string): TreeElement | undefined {
  return findElement(node, (element) => element.type === Button && getText(element.props.children) === label);
}

function renderPicker(props: SnapshotPickerProps): ReactNode {
  hookHarness.beginRender();
  return SnapshotPicker(props);
}

async function settleAsyncState(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  hookHarness.reset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SnapshotPicker interaction contract", () => {
  it("toggles the advanced details panel for a selected history snapshot", () => {
    const historyItem: SnapshotListItem = {
      id: "snap-risk",
      asOf: "2026-01-31",
      fetchedAt: "2026-02-01T00:00:00.000Z",
      staleDays: 120,
      korea: {
        policyRatePct: 2.5,
        cpiYoYPct: 2.0,
        newDepositAvgPct: 3.1,
      },
      warningsCount: 3,
    };

    const props: SnapshotPickerProps = {
      advancedEnabled: true,
      items: { history: [historyItem] },
      onChange: () => undefined,
      value: { mode: "history", id: "snap-risk" },
    };

    let tree = renderPicker(props);
    const detailsButton = findButton(tree, "Details");
    const closedPanel = findElement(tree, (element) => element.props.id === "snapshot-details-panel");

    expect(detailsButton).toBeDefined();
    expect((detailsButton?.props as { "aria-expanded"?: boolean })["aria-expanded"]).toBe(false);
    expect(closedPanel).toBeUndefined();

    (detailsButton?.props as { onClick?: () => void }).onClick?.();
    tree = renderPicker(props);

    const openButton = findButton(tree, "Details 닫기");
    const detailsPanel = findElement(tree, (element) => element.props.id === "snapshot-details-panel");

    expect(openButton).toBeDefined();
    expect((openButton?.props as { "aria-expanded"?: boolean })["aria-expanded"]).toBe(true);
    expect(detailsPanel).toBeDefined();
    expect(getText(detailsPanel?.props.children)).toContain("id: snap-risk");
    expect(getText(detailsPanel?.props.children)).toContain("asOf: 2026-01-31");
    expect(getText(detailsPanel?.props.children)).toContain("warningsCount: 3");
  });

  it("copies the selected history snapshot id and shows a success message", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const historyItem: SnapshotListItem = {
      id: "snap-copy",
      asOf: "2026-01-31",
      fetchedAt: "2026-02-01T00:00:00.000Z",
      staleDays: 12,
      warningsCount: 0,
    };

    vi.stubGlobal("navigator", {
      clipboard: { writeText },
    });

    const props: SnapshotPickerProps = {
      items: { history: [historyItem] },
      onChange: () => undefined,
      value: { mode: "history", id: "snap-copy" },
    };

    let tree = renderPicker(props);
    const copyButton = findButton(tree, "Copy snapshotId");

    expect(copyButton).toBeDefined();
    expect((copyButton?.props as { disabled?: boolean }).disabled).toBe(false);

    (copyButton?.props as { onClick?: () => void }).onClick?.();
    await settleAsyncState();
    tree = renderPicker(props);

    expect(writeText).toHaveBeenCalledWith("snap-copy");
    expect(getText(tree)).toContain("snapshotId를 복사했습니다.");
  });

  it("shows an unsupported clipboard message when clipboard api is unavailable", async () => {
    const historyItem: SnapshotListItem = {
      id: "snap-no-clipboard",
      asOf: "2026-01-31",
      fetchedAt: "2026-02-01T00:00:00.000Z",
      staleDays: 12,
      warningsCount: 0,
    };

    vi.stubGlobal("navigator", {});

    const props: SnapshotPickerProps = {
      items: { history: [historyItem] },
      onChange: () => undefined,
      value: { mode: "history", id: "snap-no-clipboard" },
    };

    let tree = renderPicker(props);
    const copyButton = findButton(tree, "Copy snapshotId");

    expect(copyButton).toBeDefined();

    (copyButton?.props as { onClick?: () => void }).onClick?.();
    await settleAsyncState();
    tree = renderPicker(props);

    expect(getText(tree)).toContain("클립보드 복사를 지원하지 않는 환경입니다.");
  });

  it("shows a failure message when clipboard writeText rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    const historyItem: SnapshotListItem = {
      id: "snap-copy-fail",
      asOf: "2026-01-31",
      fetchedAt: "2026-02-01T00:00:00.000Z",
      staleDays: 12,
      warningsCount: 0,
    };

    vi.stubGlobal("navigator", {
      clipboard: { writeText },
    });

    const props: SnapshotPickerProps = {
      items: { history: [historyItem] },
      onChange: () => undefined,
      value: { mode: "history", id: "snap-copy-fail" },
    };

    let tree = renderPicker(props);
    const copyButton = findButton(tree, "Copy snapshotId");

    expect(copyButton).toBeDefined();

    (copyButton?.props as { onClick?: () => void }).onClick?.();
    await settleAsyncState();
    tree = renderPicker(props);

    expect(writeText).toHaveBeenCalledWith("snap-copy-fail");
    expect(getText(tree)).toContain("snapshotId 복사에 실패했습니다.");
  });
});
