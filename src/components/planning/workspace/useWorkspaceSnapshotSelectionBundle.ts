"use client";

import { useEffect, useMemo, useState } from "react";
import { type SnapshotSelection } from "@/lib/planning/ui/snapshotSelection";
import {
  buildWorkspaceSnapshotItemsStateFromApi,
  isSameWorkspaceSnapshotSelection,
  normalizeWorkspaceSnapshotSelection,
  resolveInitialWorkspaceSnapshotSelection,
  resolveWorkspaceSelectedSnapshotItem,
  type SnapshotItemsState,
} from "@/lib/planning/ui/workspaceSnapshotSelection";

type WorkspaceSnapshotSelectionBundleInput = {
  initialSnapshotItems: SnapshotItemsState;
};

export function useWorkspaceSnapshotSelectionBundle({
  initialSnapshotItems,
}: WorkspaceSnapshotSelectionBundleInput) {
  const [availableSnapshotItems, setAvailableSnapshotItems] = useState<SnapshotItemsState>(initialSnapshotItems);
  const [snapshotItemsWarning, setSnapshotItemsWarning] = useState("");
  const [snapshotSelection, setSnapshotSelection] = useState<SnapshotSelection>(
    () => resolveInitialWorkspaceSnapshotSelection(initialSnapshotItems),
  );

  const effectiveSnapshotSelection = useMemo(
    () => normalizeWorkspaceSnapshotSelection(availableSnapshotItems, snapshotSelection),
    [availableSnapshotItems, snapshotSelection],
  );
  const selectedSnapshotItem = useMemo(() => {
    return resolveWorkspaceSelectedSnapshotItem(availableSnapshotItems, effectiveSnapshotSelection);
  }, [availableSnapshotItems, effectiveSnapshotSelection]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function loadSnapshotsForSelection(): Promise<void> {
      try {
        const response = await fetch("/api/planning/v2/assumptions/snapshots?limit=30", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        const payloadRecord = isRecord(payload) ? payload : null;
        if (!response.ok || payloadRecord?.ok !== true) {
          throw new Error("snapshot list request failed");
        }

        const dataNode = isRecord(payloadRecord.data) ? payloadRecord.data : payloadRecord;
        if (cancelled) return;
        setAvailableSnapshotItems(buildWorkspaceSnapshotItemsStateFromApi(dataNode));
        setSnapshotItemsWarning("");
      } catch {
        if (cancelled) return;
        setSnapshotItemsWarning("스냅샷 목록 조회에 실패했습니다. latest 기준으로 계속 진행합니다.");
      }
    }

    void loadSnapshotsForSelection();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (isSameWorkspaceSnapshotSelection(effectiveSnapshotSelection, snapshotSelection)) return;
    setSnapshotSelection(effectiveSnapshotSelection);
  }, [effectiveSnapshotSelection, snapshotSelection]);

  return {
    availableSnapshotItems,
    snapshotItemsWarning,
    snapshotSelection,
    setSnapshotSelection,
    effectiveSnapshotSelection,
    selectedSnapshotItem,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
