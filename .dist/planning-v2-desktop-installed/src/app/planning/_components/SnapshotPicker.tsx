"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatPct } from "@/lib/planning/i18n/format";
import {
  formatSnapshotLabel,
  getSnapshotFreshness,
  SNAPSHOT_STALE_CAUTION_DAYS,
} from "../_lib/formatSnapshotLabel";
import { type SnapshotListItem } from "../_lib/snapshotList";

export type SnapshotSelection =
  | { mode: "latest" }
  | { mode: "history"; id: string };

type SnapshotPickerProps = {
  items: { latest?: SnapshotListItem; history: SnapshotListItem[] };
  value: SnapshotSelection;
  onChange: (next: SnapshotSelection) => void;
  advancedEnabled?: boolean;
};

function selectedSnapshot(
  items: { latest?: SnapshotListItem; history: SnapshotListItem[] },
  value: SnapshotSelection,
): SnapshotListItem | undefined {
  if (value.mode === "latest") return items.latest;
  return items.history.find((item) => item.id === value.id);
}

export default function SnapshotPicker(props: SnapshotPickerProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const selected = useMemo(() => selectedSnapshot(props.items, props.value), [props.items, props.value]);
  const selectedStaleDays = typeof selected?.staleDays === "number" && Number.isFinite(selected.staleDays)
    ? Math.max(0, Math.trunc(selected.staleDays))
    : undefined;
  const freshness = getSnapshotFreshness(selected?.staleDays);
  const selectedWarnings = selected?.warningsCount ?? 0;
  const latestMissing = !props.items.latest;
  const staleBeyondThreshold = typeof selectedStaleDays === "number" && selectedStaleDays > SNAPSHOT_STALE_CAUTION_DAYS;
  const shouldSuggestSync = latestMissing || staleBeyondThreshold;
  const freshnessBadge = (() => {
    if (!selected) return "Unknown";
    if (typeof selectedStaleDays !== "number") return "Fresh";
    return selectedStaleDays > SNAPSHOT_STALE_CAUTION_DAYS ? `Stale ${selectedStaleDays}d` : "Fresh";
  })();

  const selectValue = props.value.mode === "latest" ? "latest" : `history:${props.value.id}`;

  async function copySnapshotId(): Promise<void> {
    if (props.value.mode !== "history") return;
    try {
      if (!navigator?.clipboard?.writeText) {
        window.alert("클립보드 복사를 지원하지 않는 환경입니다.");
        return;
      }
      await navigator.clipboard.writeText(props.value.id);
      window.alert("snapshotId를 복사했습니다.");
    } catch {
      window.alert("snapshotId 복사에 실패했습니다.");
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 p-3" data-testid="snapshot-selector">
      <p className="text-xs font-semibold text-slate-700">스냅샷 선택</p>
      <label className="block text-xs font-semibold text-slate-600">
        Snapshot
        <select
          className="mt-1 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
          data-testid="planning-snapshot-select"
          value={selectValue}
          onChange={(event) => {
            const raw = event.target.value;
            if (raw === "latest") {
              props.onChange({ mode: "latest" });
              return;
            }
            if (raw.startsWith("history:")) {
              props.onChange({ mode: "history", id: raw.slice("history:".length) });
            }
          }}
        >
          <option value="latest">
            {props.items.latest
              ? formatSnapshotLabel(props.items.latest, "latest")
              : "LATEST · unavailable"}
          </option>
          {props.items.history.map((item) => (
            <option key={item.id} value={`history:${item.id}`}>
              {formatSnapshotLabel(item, "history")}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {freshnessBadge ? (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-slate-700">
            <span data-testid="snapshot-stale-badge">{freshnessBadge}</span>
          </span>
        ) : null}
        {freshness === "risk" ? (
          <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 font-semibold text-rose-800">위험</span>
        ) : null}
        {freshness === "caution" ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 font-semibold text-amber-800">주의</span>
        ) : null}
        {selectedWarnings > 0 ? (
          <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-1 font-semibold text-orange-800">
            경고 {selectedWarnings}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {props.advancedEnabled ? (
          <Button
            aria-controls="snapshot-details-panel"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((prev) => !prev)}
            size="sm"
            variant="outline"
          >
            {detailsOpen ? "Details 닫기" : "Details"}
          </Button>
        ) : null}
        <Button
          disabled={props.value.mode !== "history"}
          onClick={() => void copySnapshotId()}
          size="sm"
          variant="outline"
        >
          Copy snapshotId
        </Button>
        <Link
          className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
          data-testid="planning-snapshot-ops-link"
          href="/ops/assumptions"
        >
          /ops/assumptions
        </Link>
      </div>

      {props.advancedEnabled && detailsOpen ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700" id="snapshot-details-panel">
          <p>id: <span className="font-semibold">{selected?.id ?? "-"}</span></p>
          <p>asOf: <span className="font-semibold">{selected?.asOf ?? "-"}</span></p>
          <p>fetchedAt: <span className="font-semibold">{selected?.fetchedAt ?? "-"}</span></p>
          <p>staleDays: <span className="font-semibold">{typeof selected?.staleDays === "number" ? selected.staleDays : "-"}</span></p>
          <p>기준금리: <span className="font-semibold">{typeof selected?.korea?.policyRatePct === "number" ? formatPct("ko-KR", selected.korea.policyRatePct) : "-"}</span></p>
          <p>CPI YoY: <span className="font-semibold">{typeof selected?.korea?.cpiYoYPct === "number" ? formatPct("ko-KR", selected.korea.cpiYoYPct) : "-"}</span></p>
          <p>예금 평균: <span className="font-semibold">{typeof selected?.korea?.newDepositAvgPct === "number" ? formatPct("ko-KR", selected.korea.newDepositAvgPct) : "-"}</span></p>
          <p>warningsCount: <span className="font-semibold">{selectedWarnings}</span></p>
        </div>
      ) : null}

      {shouldSuggestSync ? (
        <p className="text-xs text-amber-800">
          {latestMissing ? "latest 스냅샷이 없습니다." : ""}
          {staleBeyondThreshold ? ` staleDays ${selectedStaleDays}d (기준 ${SNAPSHOT_STALE_CAUTION_DAYS}d 초과).` : ""}
          {" "}
          <Link className="font-semibold underline" href="/ops/assumptions">/ops/assumptions에서 동기화 권장</Link>
        </p>
      ) : null}
    </div>
  );
}
